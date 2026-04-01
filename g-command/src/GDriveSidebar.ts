import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
import { DriveProvider } from "./DriveProvider";
import { DriveFile, GCommandSettings } from "./types";

export const VIEW_TYPE_GDRIVE_SIDEBAR = "g-command-drive";

const KEBAB_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>';

/** In-memory tree node wrapping a DriveFile with UI state. */
interface TreeNode {
  file: DriveFile;
  children: TreeNode[] | null; // null = not loaded yet
  expanded: boolean;
}

export class GDriveSidebar extends ItemView {
  private drive: DriveProvider;
  private settings: GCommandSettings;
  private rootNodes: TreeNode[] | null = null;
  private error: string | null = null;
  private loadingRoot = false;
  private onOpenSettings: () => void;

  constructor(
    leaf: WorkspaceLeaf,
    drive: DriveProvider,
    settings: GCommandSettings,
    onOpenSettings: () => void
  ) {
    super(leaf);
    this.drive = drive;
    this.settings = settings;
    this.onOpenSettings = onOpenSettings;
  }

  getViewType(): string {
    return VIEW_TYPE_GDRIVE_SIDEBAR;
  }

  getDisplayText(): string {
    return "Google Drive";
  }

  getIcon(): string {
    return "hard-drive";
  }

  async onOpen(): Promise<void> {
    await this.loadRoot();
  }

  onClose(): Promise<void> {
    this.rootNodes = null;
    return Promise.resolve();
  }

  // --- Public API -----------------------------------------------------------

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("g-command-sidebar");

    this.renderHeader(container);
    this.renderStatusLine(container);

    if (this.error) {
      this.renderErrorBanner(container, this.error);
      return;
    }

    const tree = container.createDiv({ cls: "g-command-tree" });

    if (this.loadingRoot) {
      tree.createDiv({ cls: "g-command-loading", text: "Loading…" });
      return;
    }

    if (!this.rootNodes || this.rootNodes.length === 0) {
      tree.createDiv({ cls: "g-command-empty", text: "No files found" });
      return;
    }

    for (const node of this.rootNodes) {
      this.renderNode(tree, node, 0);
    }
  }

  // --- Data loading ---------------------------------------------------------

  private async loadRoot(): Promise<void> {
    this.loadingRoot = true;
    this.error = null;
    this.render();

    try {
      await this.drive.check();
      const files = await this.drive.list("");
      this.rootNodes = files
        .sort(sortDirsFirst)
        .map(toTreeNode);
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : String(e);
      this.rootNodes = null;
    } finally {
      this.loadingRoot = false;
      this.render();
    }
  }

  private async loadChildren(node: TreeNode): Promise<void> {
    try {
      const files = await this.drive.list(node.file.Path);
      node.children = files
        .sort(sortDirsFirst)
        .map(toTreeNode);
    } catch (e: unknown) {
      node.children = [];
      const msg = e instanceof Error ? e.message : String(e);
      this.error = `Failed to load ${node.file.Name}: ${msg}`;
    }
  }

  // --- Rendering helpers ----------------------------------------------------

  private renderHeader(parent: HTMLElement): void {
    const header = parent.createDiv({ cls: "g-command-header" });

    // Title with logo badge
    const titleEl = header.createEl("div", { cls: "g-command-header-title" });
    titleEl.createEl("span", { cls: "g-command-logo", text: "GC" });
    titleEl.createEl("h4", { text: "Drive" });

    // Button group: sync + kebab menu
    const buttonGroup = header.createEl("div", { cls: "g-command-button-group" });

    // Sync button placeholder — wired up in Step 5
    const syncBtn = buttonGroup.createEl("button", {
      cls: "g-command-sync-btn clickable-icon",
      attr: { "aria-label": "Sync Drive files" },
    });
    syncBtn.createSpan({ text: "↻" });
    syncBtn.disabled = true;

    // Kebab menu
    const menuBtn = buttonGroup.createEl("button", {
      cls: "clickable-icon g-command-menu-btn",
      attr: { "aria-label": "Menu" },
    });
    menuBtn.innerHTML = KEBAB_SVG;

    menuBtn.addEventListener("click", (evt) => {
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle("Refresh")
          .setIcon("refresh-cw")
          .onClick(() => this.loadRoot())
      );
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle("Settings")
          .setIcon("settings")
          .onClick(() => this.onOpenSettings())
      );
      menu.showAtMouseEvent(evt);
    });
  }

  private renderStatusLine(parent: HTMLElement): void {
    parent.createDiv({ cls: "g-command-status", text: "Browse your Drive" });
  }

  private renderErrorBanner(parent: HTMLElement, message: string): void {
    const banner = parent.createDiv({ cls: "g-command-error-banner" });

    // First line is the title; remaining lines are help text
    const lines = message.split("\n").filter((l) => l.length > 0);
    const title = lines[0] || "Connection failed";
    const details = lines.slice(1);

    banner.createDiv({ cls: "g-command-error-title", text: title });

    for (const line of details) {
      const p = banner.createEl("p");
      // Wrap text between backticks in <code>
      const codePattern = /`([^`]+)`/g;
      if (codePattern.test(line)) {
        p.innerHTML = line.replace(/`([^`]+)`/g, "<code>$1</code>");
      } else {
        p.textContent = line;
      }
    }
  }

  private renderNode(parent: HTMLElement, node: TreeNode, depth: number): void {
    const row = parent.createDiv({ cls: "g-command-row" });
    row.style.paddingLeft = `${12 + depth * 18}px`;

    if (node.file.IsDir) {
      this.renderFolderRow(row, node, depth);
    } else {
      this.renderFileRow(row, node);
    }
  }

  private renderFolderRow(
    row: HTMLElement,
    node: TreeNode,
    depth: number
  ): void {
    // Expand/collapse arrow
    const arrow = row.createSpan({ cls: "g-command-arrow" });
    arrow.textContent = node.expanded ? "▼" : "▶";

    row.createSpan({ cls: "g-command-name", text: node.file.Name });
    row.addClass("g-command-row--folder");

    row.addEventListener("click", async () => {
      if (node.expanded) {
        node.expanded = false;
        this.render();
        return;
      }

      // Lazy-load children on first expand
      if (node.children === null) {
        arrow.textContent = "";
        arrow.addClass("g-command-arrow--loading");
        await this.loadChildren(node);
        arrow.removeClass("g-command-arrow--loading");
      }

      node.expanded = true;
      this.render();
    });

    // Render children if expanded
    if (node.expanded && node.children) {
      for (const child of node.children) {
        this.renderNode(row.parentElement!, child, depth + 1);
      }
    }
  }

  private renderFileRow(row: HTMLElement, node: TreeNode): void {
    // Spacer matching arrow width for alignment
    row.createSpan({ cls: "g-command-arrow g-command-arrow--spacer" });
    row.createSpan({ cls: "g-command-name", text: node.file.Name });
    row.addClass("g-command-row--file");
  }
}

// --- Utilities --------------------------------------------------------------

function toTreeNode(file: DriveFile): TreeNode {
  return { file, children: file.IsDir ? null : [], expanded: false };
}

function sortDirsFirst(a: DriveFile, b: DriveFile): number {
  if (a.IsDir !== b.IsDir) return a.IsDir ? -1 : 1;
  return a.Name.localeCompare(b.Name);
}
