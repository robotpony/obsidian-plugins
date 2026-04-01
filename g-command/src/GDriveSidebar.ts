import { ItemView, WorkspaceLeaf } from "obsidian";
import { DriveProvider } from "./DriveProvider";
import { DriveFile, GCommandSettings } from "./types";

export const VIEW_TYPE_GDRIVE_SIDEBAR = "g-command-drive";

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

  constructor(
    leaf: WorkspaceLeaf,
    drive: DriveProvider,
    settings: GCommandSettings
  ) {
    super(leaf);
    this.drive = drive;
    this.settings = settings;
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
    header.createSpan({ cls: "g-command-header-title", text: "Google Drive" });

    // Sync button placeholder — wired up in Step 5
    const syncBtn = header.createEl("button", {
      cls: "g-command-sync-btn clickable-icon",
      attr: { "aria-label": "Sync Drive files" },
    });
    syncBtn.createSpan({ text: "↻" });
    syncBtn.disabled = true;
  }

  private renderStatusLine(parent: HTMLElement): void {
    parent.createDiv({ cls: "g-command-status", text: "Browse your Drive" });
  }

  private renderErrorBanner(parent: HTMLElement, message: string): void {
    const banner = parent.createDiv({ cls: "g-command-error-banner" });
    // Preserve line breaks in error messages from DriveProvider
    for (const line of message.split("\n")) {
      const p = banner.createEl("p");
      // Wrap backtick-delimited text in <code>
      if (line.includes("`")) {
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
