import { ItemView, WorkspaceLeaf, TFile, Menu } from "obsidian";
import { UrlUnfurlService } from "./UrlUnfurlService";
import { UrlMetadata, LinkCommandSettings } from "./types";

export const VIEW_TYPE_LINK_SIDEBAR = "link-command-sidebar";

interface PageLink {
  url: string;
  lineNumber: number;
  isCached: boolean;
  metadata?: UrlMetadata;
  currentTitle?: string;  // Title from existing markdown link [title](url)
  isMarkdownLink: boolean;  // Whether the link is already in markdown format
}

export class LinkSidebarView extends ItemView {
  private unfurlService: UrlUnfurlService;
  private settings: LinkCommandSettings;
  private activeFileListener: (() => void) | null = null;
  private onOpenUrl: (url: string, lineNumber: number) => void;
  private onShowAbout: () => void;
  private onOpenSettings: () => void;
  private onClearHistory: () => Promise<void>;
  private renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    unfurlService: UrlUnfurlService,
    settings: LinkCommandSettings,
    onOpenUrl: (url: string, lineNumber: number) => void,
    onShowAbout: () => void,
    onOpenSettings: () => void,
    onClearHistory: () => Promise<void>
  ) {
    super(leaf);
    this.unfurlService = unfurlService;
    this.settings = settings;
    this.onOpenUrl = onOpenUrl;
    this.onShowAbout = onShowAbout;
    this.onOpenSettings = onOpenSettings;
    this.onClearHistory = onClearHistory;
  }

  getViewType(): string {
    return VIEW_TYPE_LINK_SIDEBAR;
  }

  getDisplayText(): string {
    return "Links";
  }

  getIcon(): string {
    return "link";
  }

  async onOpen(): Promise<void> {
    // Listen for active file changes
    this.activeFileListener = () => this.render();
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", this.activeFileListener)
    );
    this.registerEvent(
      this.app.workspace.on("file-open", this.activeFileListener)
    );

    // Listen for editor changes (debounced) to update when URLs are added/removed
    this.registerEvent(
      this.app.workspace.on("editor-change", () => this.debouncedRender())
    );

    await this.render();
  }

  /**
   * Debounced render to avoid excessive re-renders during typing
   */
  private debouncedRender(): void {
    if (this.renderDebounceTimer) {
      clearTimeout(this.renderDebounceTimer);
    }
    this.renderDebounceTimer = setTimeout(() => {
      this.render();
      this.renderDebounceTimer = null;
    }, 300);
  }

  async onClose(): Promise<void> {
    // Cleanup handled by registerEvent
  }

  updateSettings(settings: LinkCommandSettings): void {
    this.settings = settings;
    this.render();
  }

  async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("link-command-sidebar");

    // Header with logo, title, and menu
    this.renderHeader(container);

    const content = container.createEl("div", { cls: "link-sidebar-content" });

    // Get active file
    const activeFile = this.app.workspace.getActiveFile();

    // Section 1: Page Links
    await this.renderPageLinksSection(content, activeFile);

    // Section 2: Recent History
    this.renderRecentHistorySection(content);
  }

  private renderHeader(container: HTMLElement): void {
    const headerDiv = container.createEl("div", { cls: "link-sidebar-header" });

    // Title with logo
    const titleEl = headerDiv.createEl("h4", { cls: "link-sidebar-title" });
    const logoEl = titleEl.createEl("span", { cls: "link-command-logo clickable-logo", text: "L⌘" });
    logoEl.addEventListener("click", () => this.onShowAbout());
    titleEl.appendText(" Link Command");

    // Kebab menu button (vertical dots)
    const menuBtn = headerDiv.createEl("button", {
      cls: "clickable-icon link-sidebar-menu-btn",
      attr: { "aria-label": "Menu" },
    });
    menuBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>';

    menuBtn.addEventListener("click", (evt) => {
      const menu = new Menu();

      // Refresh
      menu.addItem((item) => {
        item
          .setTitle("Refresh")
          .setIcon("refresh-cw")
          .onClick(async () => {
            menuBtn.addClass("rotating");
            await this.render();
            setTimeout(() => menuBtn.removeClass("rotating"), 500);
          });
      });

      menu.addSeparator();

      // About
      menu.addItem((item) => {
        item
          .setTitle("About")
          .setIcon("info")
          .onClick(() => this.onShowAbout());
      });

      // Settings
      menu.addItem((item) => {
        item
          .setTitle("Settings")
          .setIcon("settings")
          .onClick(() => this.onOpenSettings());
      });

      menu.showAtMouseEvent(evt);
    });
  }

  private async renderPageLinksSection(container: HTMLElement, activeFile: TFile | null): Promise<void> {
    const section = container.createEl("div", { cls: "link-sidebar-section" });
    const header = section.createEl("div", { cls: "link-sidebar-section-header" });
    header.createEl("span", { text: "Page Links", cls: "link-sidebar-section-title" });

    const listContainer = section.createEl("div", { cls: "link-sidebar-list" });

    if (!activeFile) {
      listContainer.createEl("div", { cls: "link-sidebar-empty", text: "No file open" });
      return;
    }

    // Read file content and extract URLs
    const fileContent = await this.app.vault.read(activeFile);
    const pageLinks = this.extractLinksFromContent(fileContent);

    if (pageLinks.length === 0) {
      listContainer.createEl("div", { cls: "link-sidebar-empty", text: "No links in this file" });
      return;
    }

    // Render each link
    for (const link of pageLinks) {
      this.renderLinkItem(listContainer, link, activeFile);
    }
  }

  private renderRecentHistorySection(container: HTMLElement): void {
    const section = container.createEl("div", { cls: "link-sidebar-section" });
    const header = section.createEl("div", { cls: "link-sidebar-section-header" });
    header.createEl("span", { text: "Recent History", cls: "link-sidebar-section-title" });

    const listContainer = section.createEl("div", { cls: "link-sidebar-list" });

    const recentEntries = this.unfurlService.getRecentEntries(this.settings.recentHistoryLimit);

    if (recentEntries.length === 0) {
      listContainer.createEl("div", { cls: "link-sidebar-empty", text: "No unfurled links yet" });
      return;
    }

    // Add clear button to header
    const clearBtn = header.createEl("button", {
      cls: "clickable-icon link-sidebar-clear-btn",
      attr: { "aria-label": "Clear history" },
    });
    clearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>';
    clearBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this.onClearHistory();
      this.render();
    });

    // Render each entry
    for (const metadata of recentEntries) {
      this.renderHistoryItem(listContainer, metadata);
    }
  }

  private extractLinksFromContent(content: string): PageLink[] {
    const links: PageLink[] = [];
    const lines = content.split("\n");

    // First pass: find markdown links [title](url)
    const mdLinkRegex = /\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g;
    // Second pass: find plain URLs
    const urlRegex = /https?:\/\/[^\s\]\)>"']+/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;

      // Find markdown links first
      mdLinkRegex.lastIndex = 0;
      while ((match = mdLinkRegex.exec(line)) !== null) {
        const title = match[1];
        const url = match[2];
        if (!links.some(l => l.url === url)) {
          const cached = this.unfurlService.getCached(url);
          links.push({
            url,
            lineNumber: i,
            isCached: cached !== null,
            metadata: cached || undefined,
            currentTitle: title,
            isMarkdownLink: true,
          });
        }
      }

      // Find plain URLs (not already captured as markdown links)
      urlRegex.lastIndex = 0;
      while ((match = urlRegex.exec(line)) !== null) {
        const url = match[0].replace(/[.,;:!?)*]+$/, "");
        if (!links.some(l => l.url === url)) {
          const cached = this.unfurlService.getCached(url);
          links.push({
            url,
            lineNumber: i,
            isCached: cached !== null,
            metadata: cached || undefined,
            isMarkdownLink: false,
          });
        }
      }
    }

    return links;
  }

  private renderLinkItem(container: HTMLElement, link: PageLink, activeFile: TFile): void {
    const item = container.createEl("div", { cls: "link-sidebar-item" });

    // Favicon (if cached and available) or status dot
    if (link.metadata?.favicon) {
      const favicon = item.createEl("img", {
        cls: "link-sidebar-favicon",
        attr: { src: link.metadata.favicon, alt: "" },
      });
      favicon.addEventListener("error", () => {
        // Replace failed favicon with status dot
        favicon.remove();
        item.insertBefore(
          createEl("span", {
            cls: `link-sidebar-status ${link.isCached ? "link-sidebar-status-cached" : "link-sidebar-status-pending"}`,
            attr: { title: link.isCached ? "Unfurled" : "Not unfurled" },
          }),
          item.firstChild
        );
      });
    } else {
      // Status indicator (colored dot)
      item.createEl("span", {
        cls: `link-sidebar-status ${link.isCached ? "link-sidebar-status-cached" : "link-sidebar-status-pending"}`,
        attr: { title: link.isCached ? "Unfurled" : "Not unfurled" },
      });
    }

    // Content
    const content = item.createEl("div", { cls: "link-sidebar-item-content" });

    // Determine display title: currentTitle (from doc) > metadata.title > truncated URL
    const displayTitle = link.currentTitle || link.metadata?.title || this.truncateUrl(link.url);

    // Title row with edit button
    const titleRow = content.createEl("div", { cls: "link-sidebar-item-title-row" });
    const titleEl = titleRow.createEl("span", { cls: "link-sidebar-item-title", text: displayTitle });

    // Edit button (pencil icon) - only for markdown links
    if (link.isMarkdownLink) {
      const editBtn = titleRow.createEl("button", {
        cls: "clickable-icon link-sidebar-edit-btn",
        attr: { "aria-label": "Edit title" },
      });
      editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.startEditingTitle(titleRow, titleEl, link, activeFile);
      });
    }

    // Show subreddit if available (Reddit links)
    if (link.metadata?.subreddit) {
      content.createEl("div", { cls: "link-sidebar-item-subreddit", text: link.metadata.subreddit });
    }

    // URL display
    content.createEl("div", { cls: "link-sidebar-item-url", text: this.truncateUrl(link.url) });

    // External link button (arrow)
    const externalBtn = item.createEl("button", {
      cls: "clickable-icon link-sidebar-external-btn",
      attr: { "aria-label": "Open in browser" },
    });
    externalBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';
    externalBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.open(link.url, "_blank");
    });

    // Click to open in browser
    item.addEventListener("click", () => {
      window.open(link.url, "_blank");
    });

    // Context menu
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.showLinkContextMenu(e, link, activeFile);
    });
  }

  private startEditingTitle(
    titleRow: HTMLElement,
    titleEl: HTMLElement,
    link: PageLink,
    activeFile: TFile
  ): void {
    const currentTitle = link.currentTitle || link.metadata?.title || "";

    // Hide title, show input
    titleEl.style.display = "none";

    const input = titleRow.createEl("input", {
      cls: "link-sidebar-title-input",
      attr: {
        type: "text",
        value: currentTitle,
        placeholder: "Enter title...",
      },
    });

    input.focus();
    input.select();

    const saveAndClose = async () => {
      const newTitle = input.value.trim();
      if (newTitle && newTitle !== currentTitle) {
        await this.updateLinkTitle(activeFile, link, newTitle);
      }
      input.remove();
      titleEl.style.display = "";
      if (newTitle && newTitle !== currentTitle) {
        titleEl.textContent = newTitle;
      }
    };

    const cancelEdit = () => {
      input.remove();
      titleEl.style.display = "";
    };

    input.addEventListener("blur", saveAndClose);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        input.removeEventListener("blur", saveAndClose);
        cancelEdit();
      }
    });
  }

  private async updateLinkTitle(file: TFile, link: PageLink, newTitle: string): Promise<void> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    if (link.lineNumber >= lines.length) return;

    const line = lines[link.lineNumber];
    const urlEscaped = link.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Find and replace the markdown link [old title](url) with [new title](url)
    const mdLinkPattern = new RegExp(`\\[([^\\]]*)\\]\\(${urlEscaped}\\)`);
    const newLine = line.replace(mdLinkPattern, `[${newTitle}](${link.url})`);

    if (newLine !== line) {
      lines[link.lineNumber] = newLine;
      await this.app.vault.modify(file, lines.join("\n"));
    }
  }

  private renderHistoryItem(container: HTMLElement, metadata: UrlMetadata): void {
    const item = container.createEl("div", { cls: "link-sidebar-item link-sidebar-history-item" });

    // Favicon if available
    if (metadata.favicon) {
      const favicon = item.createEl("img", {
        cls: "link-sidebar-favicon",
        attr: { src: metadata.favicon, alt: "" },
      });
      favicon.addEventListener("error", () => favicon.remove());
    } else {
      item.createEl("span", { cls: "link-sidebar-favicon-placeholder" });
    }

    // Content
    const content = item.createEl("div", { cls: "link-sidebar-item-content" });

    // Title
    content.createEl("div", {
      cls: "link-sidebar-item-title",
      text: metadata.title || this.truncateUrl(metadata.url),
    });

    // Show subreddit if available (Reddit links)
    if (metadata.subreddit) {
      content.createEl("div", { cls: "link-sidebar-item-subreddit", text: metadata.subreddit });
    }

    // URL and source info
    const metaRow = content.createEl("div", { cls: "link-sidebar-item-meta" });
    metaRow.createEl("span", { cls: "link-sidebar-item-url", text: this.truncateUrl(metadata.url) });

    // Source pages
    if (metadata.sourcePages && metadata.sourcePages.length > 0) {
      const sourceCount = metadata.sourcePages.length;
      const sourceText = sourceCount === 1
        ? this.getFileName(metadata.sourcePages[0])
        : `${sourceCount} pages`;
      metaRow.createEl("span", { cls: "link-sidebar-item-source", text: `· ${sourceText}` });
    }

    // Timestamp
    const timeAgo = this.formatTimeAgo(metadata.fetchedAt);
    metaRow.createEl("span", { cls: "link-sidebar-item-time", text: `· ${timeAgo}` });

    // External link button (arrow)
    const externalBtn = item.createEl("button", {
      cls: "clickable-icon link-sidebar-external-btn",
      attr: { "aria-label": "Open in browser" },
    });
    externalBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';
    externalBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.open(metadata.url, "_blank");
    });

    // Click to open URL externally
    item.addEventListener("click", () => {
      window.open(metadata.url, "_blank");
    });

    // Context menu
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.showHistoryContextMenu(e, metadata);
    });
  }

  private showLinkContextMenu(e: MouseEvent, link: PageLink, activeFile: TFile): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle("Unfurl link")
        .setIcon("refresh-cw")
        .onClick(async () => {
          await this.unfurlService.unfurl(link.url, true, activeFile.path);
          this.render();
        });
    });

    menu.addItem((item) => {
      item.setTitle("Copy URL")
        .setIcon("copy")
        .onClick(async () => {
          await navigator.clipboard.writeText(link.url);
        });
    });

    if (link.metadata?.title) {
      menu.addItem((item) => {
        item.setTitle("Copy as markdown link")
          .setIcon("link")
          .onClick(async () => {
            const mdLink = `[${link.metadata!.title}](${link.url})`;
            await navigator.clipboard.writeText(mdLink);
          });
      });
    }

    menu.addItem((item) => {
      item.setTitle("Open in browser")
        .setIcon("external-link")
        .onClick(() => {
          window.open(link.url, "_blank");
        });
    });

    menu.showAtMouseEvent(e);
  }

  private showHistoryContextMenu(e: MouseEvent, metadata: UrlMetadata): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle("Copy URL")
        .setIcon("copy")
        .onClick(async () => {
          await navigator.clipboard.writeText(metadata.url);
        });
    });

    if (metadata.title) {
      menu.addItem((item) => {
        item.setTitle("Copy as markdown link")
          .setIcon("link")
          .onClick(async () => {
            const mdLink = `[${metadata.title}](${metadata.url})`;
            await navigator.clipboard.writeText(mdLink);
          });
      });
    }

    menu.addItem((item) => {
      item.setTitle("Open in browser")
        .setIcon("external-link")
        .onClick(() => {
          window.open(metadata.url, "_blank");
        });
    });

    // Show source pages if available
    if (metadata.sourcePages && metadata.sourcePages.length > 0) {
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle("Source pages")
          .setIcon("file-text")
          .setDisabled(true);
      });

      for (const sourcePath of metadata.sourcePages.slice(0, 5)) {
        menu.addItem((item) => {
          item.setTitle(`  ${this.getFileName(sourcePath)}`)
            .onClick(async () => {
              const file = this.app.vault.getAbstractFileByPath(sourcePath);
              if (file instanceof TFile) {
                await this.app.workspace.getLeaf().openFile(file);
              }
            });
        });
      }
    }

    menu.showAtMouseEvent(e);
  }

  private truncateUrl(url: string, maxLength = 50): string {
    try {
      const parsed = new URL(url);
      const display = parsed.hostname + parsed.pathname;
      if (display.length > maxLength) {
        return display.slice(0, maxLength - 3) + "...";
      }
      return display;
    } catch {
      return url.length > maxLength ? url.slice(0, maxLength - 3) + "..." : url;
    }
  }

  private getFileName(path: string): string {
    const parts = path.split("/");
    return parts[parts.length - 1].replace(/\.md$/, "");
  }

  private formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }
}
