import { App, Editor, MarkdownRenderer, Component } from "obsidian";
import { showNotice } from "./utils";

export type CommandType = "define" | "rewrite" | "review";

export interface TooltipOptions {
  loadingText?: string;
  onApply?: (content: string) => void;
  showApply?: boolean;
  commandType?: CommandType;
}

export class DefineTooltip {
  private app: App;
  private tooltip: HTMLElement | null = null;
  private closeHandler: ((e: MouseEvent) => void) | null = null;
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;
  private searchTerm: string = "";
  private currentContent: string = "";
  private options: TooltipOptions = {};
  private component: Component | null = null;

  constructor(app: App) {
    this.app = app;
  }

  show(editor: Editor, content: string, isLoading: boolean = false, term: string = "", options: TooltipOptions = {}): void {
    this.close();
    this.searchTerm = term;
    this.currentContent = content;
    this.options = options;

    // Access the underlying CodeMirror instance
    const cm = (editor as any).cm;
    if (!cm) return;

    // Get the end position of the selection for positioning
    const cursor = editor.getCursor("to");

    // Get screen coordinates - handle both CM5 and CM6
    let coords: { top: number; left: number; bottom: number } | null = null;

    if (cm.coordsAtPos) {
      // CM6 style - need to convert line/ch to absolute position
      const line = cm.state.doc.line(cursor.line + 1);
      const pos = line.from + cursor.ch;
      coords = cm.coordsAtPos(pos);
    } else if (cm.charCoords) {
      // CM5 fallback
      coords = cm.charCoords({ line: cursor.line, ch: cursor.ch }, "page");
    }

    if (!coords) return;

    // Create tooltip element
    this.tooltip = document.createElement("div");
    this.tooltip.className = "define-tooltip";
    if (isLoading) {
      this.tooltip.classList.add("define-tooltip-loading");
    }

    // Header row with logo, command type, and close button
    const headerEl = this.tooltip.createEl("div", { cls: "define-tooltip-header" });
    headerEl.createEl("span", { cls: "define-tooltip-logo space-command-logo", text: "␣⌘" });

    // Command type label
    const commandLabel = this.getCommandLabel(options.commandType);
    headerEl.createEl("span", { cls: "define-tooltip-command-type", text: commandLabel });

    // Close button
    const closeBtn = headerEl.createEl("button", {
      cls: "define-tooltip-close",
      text: "×",
      attr: { "aria-label": "Close" },
    });
    closeBtn.addEventListener("click", () => this.close());

    // Content container - below the header
    const contentEl = this.tooltip.createEl("div", { cls: "define-tooltip-content" });
    if (isLoading) {
      contentEl.createEl("span", { cls: "define-tooltip-spinner" });
      contentEl.createSpan({ text: options.loadingText || "Loading..." });
    } else {
      this.renderMarkdownContent(contentEl, content);
    }

    // Actions container (for Apply/Copy buttons)
    if (!isLoading && (options.showApply || options.onApply)) {
      this.createActionsBar();
    }

    // Position below the selection initially
    this.tooltip.style.position = "fixed";
    this.tooltip.style.top = `${coords.bottom + 8}px`;
    this.tooltip.style.left = `${coords.left}px`;

    document.body.appendChild(this.tooltip);

    // Adjust for viewport overflow - ensure tooltip stays fully visible
    this.adjustPosition(coords);
  }

  private createActionsBar(): void {
    if (!this.tooltip) return;

    const actionsEl = this.tooltip.createEl("div", { cls: "define-tooltip-actions" });

    // Copy button
    const copyBtn = actionsEl.createEl("button", {
      cls: "define-tooltip-btn define-tooltip-copy-btn",
      text: "Copy",
    });
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(this.currentContent);
      showNotice("Copied to clipboard");
    });

    // Apply button (only if onApply callback is provided)
    if (this.options.onApply) {
      const applyBtn = actionsEl.createEl("button", {
        cls: "define-tooltip-btn define-tooltip-apply-btn",
        text: "Apply",
      });
      applyBtn.addEventListener("click", () => {
        if (this.options.onApply) {
          this.options.onApply(this.currentContent);
        }
        this.close();
      });
    }
  }

  private adjustPosition(coords: { top: number; left: number; bottom: number }): void {
    if (!this.tooltip) return;

    const rect = this.tooltip.getBoundingClientRect();
    const margin = 10;

    // Horizontal adjustment - keep within viewport
    if (rect.right > window.innerWidth - margin) {
      const newLeft = Math.max(margin, window.innerWidth - rect.width - margin);
      this.tooltip.style.left = `${newLeft}px`;
    }
    if (rect.left < margin) {
      this.tooltip.style.left = `${margin}px`;
    }

    // Vertical adjustment - prefer below, but show above if needed
    if (rect.bottom > window.innerHeight - margin) {
      // Try above the selection
      const aboveTop = coords.top - rect.height - 8;
      if (aboveTop >= margin) {
        this.tooltip.style.top = `${aboveTop}px`;
      } else {
        // Neither fits well, position at top of viewport with some margin
        this.tooltip.style.top = `${margin}px`;
        // Also constrain max height if needed
        const maxHeight = window.innerHeight - 2 * margin;
        if (rect.height > maxHeight) {
          this.tooltip.style.maxHeight = `${maxHeight}px`;
          this.tooltip.style.overflowY = "auto";
        }
      }
    }

    // Set up close handlers after positioning
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

    // Delay to avoid immediate close from the context menu click
    setTimeout(() => {
      document.addEventListener("click", this.closeHandler!);
      document.addEventListener("keydown", this.escapeHandler!);
    }, 100);
  }

  private getCommandLabel(commandType?: CommandType): string {
    switch (commandType) {
      case "define":
        return "Define";
      case "rewrite":
        return "Rewrite";
      case "review":
        return "Review";
      default:
        return "";
    }
  }

  private async renderMarkdownContent(container: HTMLElement, content: string): Promise<void> {
    // Clean up previous component if exists
    if (this.component) {
      this.component.unload();
    }

    this.component = new Component();
    this.component.load();

    // Highlight the search term in the content before rendering
    let processedContent = content;
    if (this.searchTerm && this.searchTerm.trim() !== "") {
      const regex = new RegExp(`(${this.escapeRegex(this.searchTerm)})`, "gi");
      processedContent = content.replace(regex, "==$1==");
    }

    await MarkdownRenderer.render(
      this.app,
      processedContent,
      container,
      "",
      this.component
    );
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async updateContent(content: string, options?: TooltipOptions): Promise<void> {
    if (!this.tooltip) return;

    this.currentContent = content;
    if (options) {
      this.options = { ...this.options, ...options };
    }

    this.tooltip.classList.remove("define-tooltip-loading");
    const contentEl = this.tooltip.querySelector(".define-tooltip-content");
    if (contentEl) {
      (contentEl as HTMLElement).empty();
      await this.renderMarkdownContent(contentEl as HTMLElement, content);
    }

    // Add actions bar if it doesn't exist and we have options for it
    const existingActions = this.tooltip.querySelector(".define-tooltip-actions");
    if (!existingActions && (this.options.showApply || this.options.onApply)) {
      this.createActionsBar();
    }
  }

  showError(modelName: string, onOpenSettings: () => void): void {
    if (!this.tooltip) return;

    this.tooltip.classList.remove("define-tooltip-loading");
    const contentEl = this.tooltip.querySelector(".define-tooltip-content");
    if (contentEl) {
      (contentEl as HTMLElement).empty();
      const container = contentEl as HTMLElement;

      container.appendText(`Could not connect to ${modelName}. Fix in `);

      const settingsLink = container.createEl("a", {
        text: "Settings",
        cls: "define-tooltip-settings-link",
      });
      settingsLink.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.close();
        onOpenSettings();
      });

      container.appendText(".");
    }
  }

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
    this.searchTerm = "";
    this.currentContent = "";
    this.options = {};
  }
}
