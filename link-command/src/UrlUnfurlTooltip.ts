import { App, Editor, Component } from "obsidian";
import { UrlMetadata, UrlMetadataResult } from "./types";

export interface TooltipActions {
  onInsertLink: (metadata: UrlMetadata) => void;
  onInsertCard: (metadata: UrlMetadata) => void;
  onCopy: (metadata: UrlMetadata) => void;
  onRetry: () => void;
}

/**
 * Floating tooltip for displaying URL previews
 * Follows patterns from space-command's DefineTooltip
 */
export class UrlUnfurlTooltip {
  private app: App;
  private tooltip: HTMLElement | null = null;
  private closeHandler: ((e: MouseEvent) => void) | null = null;
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;
  private component: Component | null = null;
  private currentUrl: string = "";
  private actions: TooltipActions | null = null;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Show tooltip with loading state
   */
  showLoading(editor: Editor, url: string, actions: TooltipActions): void {
    this.show(editor, url, { loading: true }, actions);
  }

  /**
   * Show tooltip with metadata
   */
  showMetadata(editor: Editor, url: string, metadata: UrlMetadata, actions: TooltipActions): void {
    this.show(editor, url, { metadata }, actions);
  }

  /**
   * Show tooltip with error
   */
  showError(editor: Editor, url: string, error: string, actions: TooltipActions): void {
    this.show(editor, url, { error }, actions);
  }

  /**
   * Update existing tooltip content
   */
  updateContent(result: UrlMetadataResult): void {
    if (!this.tooltip) return;

    const contentEl = this.tooltip.querySelector(".link-tooltip-content");
    if (!contentEl) return;

    (contentEl as HTMLElement).empty();

    if (result.success && result.metadata) {
      this.renderMetadata(contentEl as HTMLElement, result.metadata);
      this.tooltip.classList.remove("link-tooltip-loading", "link-tooltip-error");
      this.createActionsBar(result.metadata);
    } else {
      this.renderError(contentEl as HTMLElement, result.errorMessage || "Failed to fetch link");
      this.tooltip.classList.remove("link-tooltip-loading");
      this.tooltip.classList.add("link-tooltip-error");
    }
  }

  /**
   * Close the tooltip
   */
  close(): void {
    if (this.component) {
      this.component.unload();
      this.component = null;
    }
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
    if (this.closeHandler) {
      document.removeEventListener("click", this.closeHandler);
      this.closeHandler = null;
    }
    if (this.escapeHandler) {
      document.removeEventListener("keydown", this.escapeHandler);
      this.escapeHandler = null;
    }
    this.currentUrl = "";
    this.actions = null;
  }

  private show(
    editor: Editor,
    url: string,
    content: { loading?: boolean; metadata?: UrlMetadata; error?: string },
    actions: TooltipActions
  ): void {
    this.close();
    this.currentUrl = url;
    this.actions = actions;

    // Get cursor position for tooltip placement
    const cm = (editor as any).cm;
    if (!cm) return;

    const cursor = editor.getCursor("to");
    let coords: { top: number; left: number; bottom: number } | null = null;

    if (cm.coordsAtPos) {
      const line = cm.state.doc.line(cursor.line + 1);
      const pos = line.from + cursor.ch;
      coords = cm.coordsAtPos(pos);
    } else if (cm.charCoords) {
      coords = cm.charCoords({ line: cursor.line, ch: cursor.ch }, "page");
    }

    if (!coords) return;

    // Create tooltip
    this.tooltip = document.createElement("div");
    this.tooltip.className = "link-tooltip";

    if (content.loading) {
      this.tooltip.classList.add("link-tooltip-loading");
    }
    if (content.error) {
      this.tooltip.classList.add("link-tooltip-error");
    }

    // Header with logo and close button
    const headerEl = this.tooltip.createEl("div", { cls: "link-tooltip-header" });
    headerEl.createEl("span", { cls: "link-tooltip-logo", text: "Link" });

    // Show domain
    try {
      const hostname = new URL(url).hostname;
      headerEl.createEl("span", { cls: "link-tooltip-domain", text: hostname });
    } catch {
      // Invalid URL, skip domain display
    }

    const closeBtn = headerEl.createEl("button", {
      cls: "link-tooltip-close",
      text: "×",
      attr: { "aria-label": "Close" },
    });
    closeBtn.addEventListener("click", () => this.close());

    // Content
    const contentEl = this.tooltip.createEl("div", { cls: "link-tooltip-content" });

    if (content.loading) {
      contentEl.createEl("span", { cls: "link-tooltip-spinner" });
      contentEl.createSpan({ text: "Fetching link..." });
    } else if (content.metadata) {
      this.renderMetadata(contentEl, content.metadata);
      this.createActionsBar(content.metadata);
    } else if (content.error) {
      this.renderError(contentEl, content.error);
    }

    // Position tooltip
    this.tooltip.style.position = "fixed";
    this.tooltip.style.top = `${coords.bottom + 8}px`;
    this.tooltip.style.left = `${coords.left}px`;

    document.body.appendChild(this.tooltip);
    this.adjustPosition(coords);
  }

  private renderMetadata(container: HTMLElement, metadata: UrlMetadata): void {
    // Image preview (if available)
    if (metadata.image) {
      const imgContainer = container.createEl("div", { cls: "link-tooltip-image-container" });
      const img = imgContainer.createEl("img", {
        cls: "link-tooltip-image",
        attr: { src: metadata.image, alt: metadata.title || "Preview" },
      });
      img.addEventListener("error", () => {
        imgContainer.remove();
      });
    }

    // Title
    if (metadata.title) {
      container.createEl("div", { cls: "link-tooltip-title", text: metadata.title });
    } else {
      container.createEl("div", { cls: "link-tooltip-title link-tooltip-no-title", text: "No title available" });
    }

    // Description
    if (metadata.description) {
      const desc = container.createEl("div", { cls: "link-tooltip-description" });
      // Truncate long descriptions
      const maxLen = 200;
      desc.textContent = metadata.description.length > maxLen
        ? metadata.description.slice(0, maxLen) + "..."
        : metadata.description;
    }

    // Site name and favicon
    if (metadata.siteName || metadata.favicon) {
      const siteRow = container.createEl("div", { cls: "link-tooltip-site" });
      if (metadata.favicon) {
        const favicon = siteRow.createEl("img", {
          cls: "link-tooltip-favicon",
          attr: { src: metadata.favicon, alt: "" },
        });
        favicon.addEventListener("error", () => {
          favicon.remove();
        });
      }
      if (metadata.siteName) {
        siteRow.createEl("span", { text: metadata.siteName });
      }
    }
  }

  private renderError(container: HTMLElement, error: string): void {
    container.createEl("div", { cls: "link-tooltip-error-message", text: error });

    if (this.actions) {
      const retryBtn = container.createEl("button", {
        cls: "link-tooltip-btn link-tooltip-retry-btn",
        text: "Retry",
      });
      retryBtn.addEventListener("click", () => {
        if (this.actions) {
          this.actions.onRetry();
        }
      });
    }
  }

  private createActionsBar(metadata: UrlMetadata): void {
    if (!this.tooltip || !this.actions) return;

    // Remove existing actions bar if any
    const existingActions = this.tooltip.querySelector(".link-tooltip-actions");
    if (existingActions) {
      existingActions.remove();
    }

    const actionsEl = this.tooltip.createEl("div", { cls: "link-tooltip-actions" });

    // Insert as Link button
    const linkBtn = actionsEl.createEl("button", {
      cls: "link-tooltip-btn",
      text: "Insert Link",
    });
    linkBtn.addEventListener("click", () => {
      if (this.actions) {
        this.actions.onInsertLink(metadata);
      }
      this.close();
    });

    // Insert as Card button
    const cardBtn = actionsEl.createEl("button", {
      cls: "link-tooltip-btn",
      text: "Insert Card",
    });
    cardBtn.addEventListener("click", () => {
      if (this.actions) {
        this.actions.onInsertCard(metadata);
      }
      this.close();
    });

    // Copy button
    const copyBtn = actionsEl.createEl("button", {
      cls: "link-tooltip-btn link-tooltip-copy-btn",
      text: "Copy",
    });
    copyBtn.addEventListener("click", async () => {
      if (this.actions) {
        this.actions.onCopy(metadata);
      }
    });
  }

  private adjustPosition(coords: { top: number; left: number; bottom: number }): void {
    if (!this.tooltip) return;

    const rect = this.tooltip.getBoundingClientRect();
    const margin = 10;

    // Horizontal adjustment
    if (rect.right > window.innerWidth - margin) {
      const newLeft = Math.max(margin, window.innerWidth - rect.width - margin);
      this.tooltip.style.left = `${newLeft}px`;
    }
    if (rect.left < margin) {
      this.tooltip.style.left = `${margin}px`;
    }

    // Vertical adjustment - prefer below, show above if needed
    if (rect.bottom > window.innerHeight - margin) {
      const aboveTop = coords.top - rect.height - 8;
      if (aboveTop >= margin) {
        this.tooltip.style.top = `${aboveTop}px`;
      } else {
        this.tooltip.style.top = `${margin}px`;
        const maxHeight = window.innerHeight - 2 * margin;
        if (rect.height > maxHeight) {
          this.tooltip.style.maxHeight = `${maxHeight}px`;
          this.tooltip.style.overflowY = "auto";
        }
      }
    }

    // Set up close handlers
    this.closeHandler = (e: MouseEvent) => {
      if (this.tooltip && !this.tooltip.contains(e.target as Node)) {
        this.close();
      }
    };
    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.close();
      }
    };

    setTimeout(() => {
      document.addEventListener("click", this.closeHandler!);
      document.addEventListener("keydown", this.escapeHandler!);
    }, 100);
  }
}
