import { App, Modal, Setting, TFile } from "obsidian";
import { HugoSiteConfig } from "./types";
import {
  LOGO_PREFIX,
  showNotice,
  findHugoConfigFile,
  getConfigFormat,
  parseHugoConfig,
  serializeHugoConfig,
} from "./utils";

/**
 * Modal for editing Hugo site configuration
 */
export class SiteSettingsModal extends Modal {
  private config: HugoSiteConfig = {};
  private configFile: TFile | null = null;
  private format: "toml" | "yaml" = "toml";
  private hasChanges = false;

  constructor(app: App) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("hugo-command-site-settings");
    modalEl.addClass("hugo-command-site-settings-modal");

    // Load config file
    this.configFile = await findHugoConfigFile(this.app);

    if (!this.configFile) {
      this.renderNoConfigFound(contentEl);
      return;
    }

    this.format = getConfigFormat(this.configFile.name);
    const content = await this.app.vault.read(this.configFile);
    this.config = parseHugoConfig(content, this.format);

    this.renderSettings(contentEl);
  }

  private renderNoConfigFound(container: HTMLElement): void {
    // Header (fixed)
    const header = container.createEl("div", { cls: "site-settings-header" });
    header.createEl("span", { cls: "hugo-command-logo", text: LOGO_PREFIX });
    header.createEl("h2", { text: "Site Settings" });

    container.createEl("p", {
      cls: "site-settings-error",
      text: "No Hugo config file found. Create hugo.toml or config.toml in the vault root.",
    });
  }

  private renderSettings(container: HTMLElement): void {
    // Fixed header section
    const headerSection = container.createEl("div", { cls: "site-settings-header-section" });

    // Header with logo
    const header = headerSection.createEl("div", { cls: "site-settings-header" });
    header.createEl("span", { cls: "hugo-command-logo", text: LOGO_PREFIX });
    header.createEl("h2", { text: "Site Settings" });

    // Site title display (prominent)
    const titleDisplay = headerSection.createEl("div", { cls: "site-settings-title-display" });
    const siteTitle = (this.config.title as string) || "Untitled Site";
    titleDisplay.createEl("span", { cls: "site-title-label", text: "Site:" });
    titleDisplay.createEl("span", { cls: "site-title-value", text: siteTitle });

    // Scrollable content area
    const scrollArea = container.createEl("div", { cls: "site-settings-scroll-area" });

    // Basic Settings Section
    scrollArea.createEl("h3", { text: "Basic Settings" });

    new Setting(scrollArea)
      .setName("Site title")
      .setDesc("The title of your Hugo site")
      .addText((text) =>
        text
          .setPlaceholder("My Hugo Site")
          .setValue((this.config.title as string) || "")
          .onChange((value) => {
            this.config.title = value;
            this.hasChanges = true;
            // Update the title display
            const titleValue = container.querySelector(".site-title-value");
            if (titleValue) {
              titleValue.textContent = value || "Untitled Site";
            }
          })
      );

    new Setting(scrollArea)
      .setName("Base URL")
      .setDesc("The base URL for your site (e.g., https://example.com/)")
      .addText((text) =>
        text
          .setPlaceholder("https://example.com/")
          .setValue((this.config.baseURL as string) || "")
          .onChange((value) => {
            this.config.baseURL = value;
            this.hasChanges = true;
          })
      );

    new Setting(scrollArea)
      .setName("Language code")
      .setDesc("The language code for your site (e.g., en-us)")
      .addText((text) =>
        text
          .setPlaceholder("en-us")
          .setValue((this.config.languageCode as string) || "")
          .onChange((value) => {
            this.config.languageCode = value;
            this.hasChanges = true;
          })
      );

    new Setting(scrollArea)
      .setName("Summary length")
      .setDesc("Number of words in auto-generated summaries")
      .addText((text) =>
        text
          .setPlaceholder("70")
          .setValue(String(this.config.summaryLength || ""))
          .onChange((value) => {
            const num = parseInt(value, 10);
            this.config.summaryLength = isNaN(num) ? undefined : num;
            this.hasChanges = true;
          })
      );

    new Setting(scrollArea)
      .setName("Paginate")
      .setDesc("Number of items per page in list pages")
      .addText((text) =>
        text
          .setPlaceholder("10")
          .setValue(String(this.config.paginate || ""))
          .onChange((value) => {
            const num = parseInt(value, 10);
            this.config.paginate = isNaN(num) ? undefined : num;
            this.hasChanges = true;
          })
      );

    // Author & Copyright Section
    scrollArea.createEl("h3", { text: "Author & Copyright" });

    new Setting(scrollArea)
      .setName("Author")
      .setDesc("Site author name")
      .addText((text) =>
        text
          .setPlaceholder("Your Name")
          .setValue((this.config.author as string) || "")
          .onChange((value) => {
            this.config.author = value;
            this.hasChanges = true;
          })
      );

    new Setting(scrollArea)
      .setName("Copyright")
      .setDesc("Copyright notice for your site")
      .addText((text) =>
        text
          .setPlaceholder("Copyright 2024")
          .setValue((this.config.copyright as string) || "")
          .onChange((value) => {
            this.config.copyright = value;
            this.hasChanges = true;
          })
      );

    // Theme Section
    scrollArea.createEl("h3", { text: "Theme" });

    new Setting(scrollArea)
      .setName("Theme")
      .setDesc("The Hugo theme to use")
      .addText((text) =>
        text
          .setPlaceholder("theme-name")
          .setValue((this.config.theme as string) || "")
          .onChange((value) => {
            this.config.theme = value;
            this.hasChanges = true;
          })
      );

    // Build Settings Section
    scrollArea.createEl("h3", { text: "Build Settings" });

    new Setting(scrollArea)
      .setName("Build drafts")
      .setDesc("Include draft content when building")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.config.buildDrafts))
          .onChange((value) => {
            this.config.buildDrafts = value;
            this.hasChanges = true;
          })
      );

    new Setting(scrollArea)
      .setName("Build future")
      .setDesc("Include content with future publish dates")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.config.buildFuture))
          .onChange((value) => {
            this.config.buildFuture = value;
            this.hasChanges = true;
          })
      );

    new Setting(scrollArea)
      .setName("Build expired")
      .setDesc("Include expired content")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.config.buildExpired))
          .onChange((value) => {
            this.config.buildExpired = value;
            this.hasChanges = true;
          })
      );

    // Features Section
    scrollArea.createEl("h3", { text: "Features" });

    new Setting(scrollArea)
      .setName("Enable robots.txt")
      .setDesc("Generate robots.txt file")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.config.enableRobotsTXT))
          .onChange((value) => {
            this.config.enableRobotsTXT = value;
            this.hasChanges = true;
          })
      );

    new Setting(scrollArea)
      .setName("Enable Git info")
      .setDesc("Use Git for .Lastmod and other metadata")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.config.enableGitInfo))
          .onChange((value) => {
            this.config.enableGitInfo = value;
            this.hasChanges = true;
          })
      );

    new Setting(scrollArea)
      .setName("Disable kinds")
      .setDesc("Page kinds to disable (comma-separated: taxonomy, term, RSS, sitemap)")
      .addText((text) =>
        text
          .setPlaceholder("taxonomy, term")
          .setValue(Array.isArray(this.config.disableKinds) ? this.config.disableKinds.join(", ") : "")
          .onChange((value) => {
            this.config.disableKinds = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            this.hasChanges = true;
          })
      );

    // Taxonomies Section
    scrollArea.createEl("h3", { text: "Taxonomies" });

    const taxonomies = (this.config.taxonomies as Record<string, string>) || {};

    new Setting(scrollArea)
      .setName("Category taxonomy")
      .setDesc("Plural name for category taxonomy")
      .addText((text) =>
        text
          .setPlaceholder("categories")
          .setValue(taxonomies.category || "")
          .onChange((value) => {
            if (!this.config.taxonomies) this.config.taxonomies = {};
            (this.config.taxonomies as Record<string, string>).category = value;
            this.hasChanges = true;
          })
      );

    new Setting(scrollArea)
      .setName("Tag taxonomy")
      .setDesc("Plural name for tag taxonomy")
      .addText((text) =>
        text
          .setPlaceholder("tags")
          .setValue(taxonomies.tag || "")
          .onChange((value) => {
            if (!this.config.taxonomies) this.config.taxonomies = {};
            (this.config.taxonomies as Record<string, string>).tag = value;
            this.hasChanges = true;
          })
      );

    // Permalinks Section
    scrollArea.createEl("h3", { text: "Permalinks" });

    const permalinks = (this.config.permalinks as Record<string, string>) || {};

    new Setting(scrollArea)
      .setName("Posts permalink")
      .setDesc("URL structure for posts (e.g., /:year/:month/:slug/)")
      .addText((text) =>
        text
          .setPlaceholder("/:year/:month/:slug/")
          .setValue(permalinks.posts || permalinks.post || "")
          .onChange((value) => {
            if (!this.config.permalinks) this.config.permalinks = {};
            (this.config.permalinks as Record<string, string>).posts = value;
            this.hasChanges = true;
          })
      );

    // Params Section (if exists)
    const params = this.config.params as Record<string, unknown> | undefined;
    if (params && Object.keys(params).length > 0) {
      scrollArea.createEl("h3", { text: "Site Parameters" });

      for (const [key, value] of Object.entries(params)) {
        this.renderParamSetting(scrollArea, key, value);
      }
    }

    // Fixed footer section
    const footerSection = container.createEl("div", { cls: "site-settings-footer-section" });

    // Config file info (in footer) - clickable to open in editor
    const fileInfo = footerSection.createEl("div", {
      cls: "site-settings-file-info clickable",
    });
    fileInfo.createEl("span", { text: "Config: " });
    const fileLink = fileInfo.createEl("span", {
      cls: "site-settings-file-link",
      text: this.configFile?.name || "",
    });
    fileLink.addEventListener("click", async () => {
      if (this.configFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(this.configFile);
        this.close();
      }
    });

    // Buttons
    const buttonContainer = footerSection.createEl("div", { cls: "site-settings-buttons" });

    const cancelBtn = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelBtn.addEventListener("click", () => {
      this.close();
    });

    const saveBtn = buttonContainer.createEl("button", {
      cls: "mod-cta",
      text: "Save",
    });
    saveBtn.addEventListener("click", async () => {
      await this.saveConfig();
    });
  }

  private renderParamSetting(
    container: HTMLElement,
    key: string,
    value: unknown
  ): void {
    // Format the key for display (camelCase to Title Case)
    const displayName = key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();

    if (typeof value === "boolean") {
      new Setting(container)
        .setName(displayName)
        .setDesc(`params.${key}`)
        .addToggle((toggle) =>
          toggle.setValue(value).onChange((newValue) => {
            if (!this.config.params) this.config.params = {};
            (this.config.params as Record<string, unknown>)[key] = newValue;
            this.hasChanges = true;
          })
        );
    } else if (typeof value === "number") {
      new Setting(container)
        .setName(displayName)
        .setDesc(`params.${key}`)
        .addText((text) =>
          text
            .setValue(String(value))
            .onChange((newValue) => {
              if (!this.config.params) this.config.params = {};
              const num = Number(newValue);
              (this.config.params as Record<string, unknown>)[key] = isNaN(num) ? newValue : num;
              this.hasChanges = true;
            })
        );
    } else if (typeof value === "string") {
      new Setting(container)
        .setName(displayName)
        .setDesc(`params.${key}`)
        .addText((text) =>
          text.setValue(value).onChange((newValue) => {
            if (!this.config.params) this.config.params = {};
            (this.config.params as Record<string, unknown>)[key] = newValue;
            this.hasChanges = true;
          })
        );
    }
    // Skip complex nested objects for now
  }

  private async saveConfig(): Promise<void> {
    if (!this.configFile) {
      showNotice("No config file to save");
      return;
    }

    try {
      const content = serializeHugoConfig(this.config, this.format);
      await this.app.vault.modify(this.configFile, content);
      showNotice("Site settings saved");
      this.hasChanges = false;
      this.close();
    } catch (error) {
      showNotice("Failed to save settings");
      console.error("Failed to save Hugo config:", error);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
