import { App, ItemView, Menu, WorkspaceLeaf } from "obsidian";
import { DriveProvider, DriveError } from "./DriveProvider";
import { DriveFile, GCommandSettings, SyncRecord } from "./types";
import { syncFiles, getFormatMapping, SyncLogFn } from "./SyncManager";

export const VIEW_TYPE_GDRIVE_SIDEBAR = "g-command-drive";

const KEBAB_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>';

/** In-memory tree node wrapping a DriveFile with UI state. */
interface TreeNode {
  file: DriveFile;
  children: TreeNode[] | null; // null = not loaded yet
  expanded: boolean;
}

interface LogEntry {
  time: string; // HH:MM:SS
  level: "info" | "error";
  message: string;
}

const MAX_LOG_ENTRIES = 50;

export class GDriveSidebar extends ItemView {
  private appRef: App;
  private drive: DriveProvider;
  private settings: GCommandSettings;
  private saveSettings: () => Promise<void>;
  private rootNodes: TreeNode[] | null = null;
  private error: DriveError | Error | null = null;
  private loadingRoot = false;
  private searchQuery = "";
  private allFiles: DriveFile[] | null = null; // cached recursive results
  private searchingAll = false;
  private syncing = false;
  private syncStatus: "idle" | "syncing" | "error" = "idle";
  private selectedPaths: Set<string>;
  private logEntries: LogEntry[] = [];
  private logCollapsed = true;
  private onOpenSettings: () => void;
  private pluginDir: string;

  constructor(
    leaf: WorkspaceLeaf,
    app: App,
    drive: DriveProvider,
    settings: GCommandSettings,
    saveSettings: () => Promise<void>,
    onOpenSettings: () => void,
    pluginDir: string
  ) {
    super(leaf);
    this.appRef = app;
    this.drive = drive;
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.selectedPaths = new Set(settings.selectedPaths);
    this.onOpenSettings = onOpenSettings;
    this.pluginDir = pluginDir;
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
    this.allFiles = null;
    this.searchQuery = "";
    return Promise.resolve();
  }

  // --- Public API -----------------------------------------------------------

  /** Full data reload: re-checks rclone and reloads the Drive root. */
  async reload(): Promise<void> {
    await this.loadRoot();
  }

  /** Sync selected files to the vault. */
  async syncSelected(): Promise<void> {
    if (this.selectedPaths.size === 0 || this.syncing) return;
    const files = await this.collectSelectedFiles();
    if (files.length === 0) return;
    await this.runSync(files);
  }

  /** Resync all previously synced files. */
  async resyncAll(): Promise<void> {
    if (this.syncing) return;
    const paths = Object.keys(this.settings.syncState);
    if (paths.length === 0) return;

    // Build DriveFile stubs from syncState + any loaded tree nodes
    const files = this.collectSyncedFiles(paths);
    if (files.length === 0) return;
    await this.runSync(files);
  }

  private async runSync(files: DriveFile[]): Promise<void> {
    this.syncing = true;
    this.syncStatus = "syncing";
    this.log("info", `Syncing ${files.length} file(s)…`);
    this.render();

    // Pass our log method so syncFiles can report per-file progress
    const onLog: SyncLogFn = (level, msg) => {
      this.log(level, msg);
      this.render(); // live-update the log pane
    };

    try {
      const result = await syncFiles(
        files,
        this.appRef,
        this.drive,
        this.settings,
        this.saveSettings,
        onLog,
      );
      const parts: string[] = [];
      if (result.synced > 0) parts.push(`${result.synced} synced`);
      if (result.skipped > 0) parts.push(`${result.skipped} unchanged`);
      if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
      this.log("info", `Done: ${parts.join(", ")}`);
      this.syncStatus = result.failed.length > 0 ? "error" : "idle";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("error", `Sync error: ${msg}`);
      this.syncStatus = "error";
    } finally {
      this.syncing = false;
      this.render();
    }
  }

  /** Collect DriveFile objects for all selected paths from the loaded tree. */
  private async collectSelectedFiles(): Promise<DriveFile[]> {
    const seen = new Set<string>();
    const files: DriveFile[] = [];

    const addFile = (f: DriveFile) => {
      if (!f.IsDir && !seen.has(f.Path)) {
        seen.add(f.Path);
        files.push(f);
      }
    };

    // Collect individual files from tree
    const collect = (nodes: TreeNode[] | null) => {
      if (!nodes) return;
      for (const node of nodes) {
        if (!node.file.IsDir && this.selectedPaths.has(node.file.Path)) {
          addFile(node.file);
        }
        if (node.children) collect(node.children);
      }
    };
    collect(this.rootNodes);

    // Also check allFiles from recursive search
    if (this.allFiles) {
      for (const f of this.allFiles) {
        if (this.selectedPaths.has(f.Path)) addFile(f);
      }
    }

    // Expand selected folders via listRecursive
    const folderPaths = this.findSelectedFolders();
    for (const folderPath of folderPaths) {
      try {
        const children = await this.drive.listRecursive(folderPath);
        for (const f of children) {
          // rclone returns paths relative to the listed folder
          f.Path = `${folderPath}/${f.Path}`;
          addFile(f);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log("error", `Failed to list folder ${folderPath}: ${msg}`);
      }
    }

    return files;
  }

  /** Find selected paths that are known folder nodes in the loaded tree. */
  private findSelectedFolders(): string[] {
    const folders: string[] = [];
    const walk = (nodes: TreeNode[] | null) => {
      if (!nodes) return;
      for (const node of nodes) {
        if (node.file.IsDir && this.selectedPaths.has(node.file.Path)) {
          folders.push(node.file.Path);
        }
        if (node.children) walk(node.children);
      }
    };
    walk(this.rootNodes);
    return folders;
  }

  /** Build DriveFile list for resync from syncState paths, using loaded tree data. */
  private collectSyncedFiles(paths: string[]): DriveFile[] {
    const fileMap = new Map<string, DriveFile>();
    const index = (nodes: TreeNode[] | null) => {
      if (!nodes) return;
      for (const node of nodes) {
        if (!node.file.IsDir) fileMap.set(node.file.Path, node.file);
        if (node.children) index(node.children);
      }
    };
    index(this.rootNodes);
    if (this.allFiles) {
      for (const f of this.allFiles) {
        if (!f.IsDir) fileMap.set(f.Path, f);
      }
    }

    const files: DriveFile[] = [];
    for (const p of paths) {
      const f = fileMap.get(p);
      if (f) {
        files.push(f);
      } else {
        // File not in loaded tree — build stub from syncState
        const rec = this.settings.syncState[p];
        if (rec) {
          const name = p.split("/").pop() ?? p;
          files.push({
            Path: p,
            Name: name,
            Size: -1,
            MimeType: "", // syncFiles uses getFormatMapping which handles unknown mimes
            ModTime: "", // empty forces re-download (won't match stored modTime)
            IsDir: false,
            ID: rec.fileId,
          });
        }
      }
    }
    return files;
  }

  private persistSelectedPaths(): void {
    this.settings.selectedPaths = Array.from(this.selectedPaths);
    this.saveSettings();
  }

  private log(level: "info" | "error", message: string): void {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    this.logEntries.push({ time, level, message });
    if (this.logEntries.length > MAX_LOG_ENTRIES) {
      this.logEntries.shift();
    }
    if (level === "error") {
      console.error("[G Command]", message);
    } else {
      console.log("[G Command]", message);
    }
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("g-command-sidebar");

    this.renderHeader(container);
    this.renderSearchBar(container);
    this.renderStatusLine(container);

    if (this.error) {
      this.renderErrorBanner(container);
      return;
    }

    // Synced files section above the tree
    if (Object.keys(this.settings.syncState).length > 0) {
      this.renderSyncedPane(container);
    }

    container.createDiv({ cls: "g-command-section-header", text: "Drive" });
    const tree = container.createDiv({ cls: "g-command-tree" });

    if (this.loadingRoot) {
      tree.createDiv({ cls: "g-command-loading", text: "Loading…" });
      return;
    }

    if (!this.rootNodes || this.rootNodes.length === 0) {
      tree.createDiv({ cls: "g-command-empty", text: "No files found" });
      return;
    }

    // Apply search filter
    const query = this.searchQuery.trim();
    let displayNodes: TreeNode[];

    if (query) {
      // If we have cached recursive results, search those; otherwise filter loaded tree
      if (this.allFiles) {
        const allNodes = flattenToNodes(this.allFiles);
        displayNodes = filterTree(allNodes, query);
      } else {
        displayNodes = filterTree(this.rootNodes, query);
      }
    } else {
      displayNodes = this.rootNodes;
    }

    if (query && displayNodes.length === 0 && !this.allFiles) {
      tree.createDiv({ cls: "g-command-empty", text: "No matches in loaded folders" });
    } else if (query && displayNodes.length === 0) {
      tree.createDiv({ cls: "g-command-empty", text: "No matches found" });
    } else {
      for (const node of displayNodes) {
        this.renderNode(tree, node, 0);
      }
    }

    // "Search all" button when filtering locally and results may be incomplete
    if (query && !this.allFiles) {
      this.renderSearchAllButton(tree);
    }

    // Log pane at bottom
    if (this.logEntries.length > 0) {
      this.renderLogPane(container);
    }
  }

  // --- Data loading ---------------------------------------------------------

  private async loadRoot(): Promise<void> {
    this.loadingRoot = true;
    this.error = null;
    this.allFiles = null; // invalidate search-all cache on refresh
    this.render();

    try {
      await this.drive.check();
      const files = await this.drive.list("");
      this.rootNodes = files
        .sort(sortDirsFirst)
        .map(toTreeNode);
    } catch (e: unknown) {
      const err = e instanceof DriveError || e instanceof Error
        ? e
        : new Error(String(e));
      console.error("[G Command] loadRoot failed:", err.message);
      this.error = err;
      this.rootNodes = null;
    } finally {
      this.loadingRoot = false;
      this.render();
    }
  }

  private async loadChildren(node: TreeNode): Promise<void> {
    try {
      const files = await this.drive.list(node.file.Path);
      // rclone lsjson returns Path relative to the listed folder.
      // Prefix with parent path so cat/sync use full remote paths.
      for (const f of files) {
        f.Path = `${node.file.Path}/${f.Path}`;
      }
      node.children = files
        .sort(sortDirsFirst)
        .map(toTreeNode);
    } catch (e: unknown) {
      const msg = `Failed to load ${node.file.Name}: ${e instanceof Error ? e.message : String(e)}`;
      console.error("[G Command]", msg);
      node.children = [];
      this.error = new Error(msg);
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

    // Sync button — active when files are selected
    const hasSelection = this.selectedPaths.size > 0;
    const syncBtn = buttonGroup.createEl("button", {
      cls: "g-command-sync-btn clickable-icon",
      attr: { "aria-label": hasSelection ? `Sync ${this.selectedPaths.size} file(s)` : "Select files to sync" },
    });
    syncBtn.createSpan({ text: this.syncing ? "⏳" : "↻" });
    syncBtn.disabled = !hasSelection || this.syncing;
    syncBtn.addEventListener("click", () => this.syncSelected());

    // Kebab menu
    const menuBtn = buttonGroup.createEl("button", {
      cls: "clickable-icon g-command-menu-btn",
      attr: { "aria-label": "Menu" },
    });
    menuBtn.innerHTML = KEBAB_SVG;

    const hasSyncedFiles = Object.keys(this.settings.syncState).length > 0;

    menuBtn.addEventListener("click", (evt) => {
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle("Refresh")
          .setIcon("refresh-cw")
          .onClick(() => this.loadRoot())
      );
      if (hasSyncedFiles) {
        menu.addItem((item) =>
          item
            .setTitle("Resync all")
            .setIcon("refresh-cw")
            .onClick(() => this.resyncAll())
        );
        menu.addItem((item) =>
          item
            .setTitle("Clear sync cache")
            .setIcon("trash")
            .onClick(async () => {
              this.settings.syncState = {};
              await this.saveSettings();
              this.log("info", "Sync cache cleared — all files will re-download on next sync");
              this.render();
            })
        );
      }
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

  private renderSearchBar(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: "g-command-search-row" });

    const input = row.createEl("input", {
      cls: "g-command-search",
      attr: { type: "text", placeholder: "Search files…" },
    });
    input.value = this.searchQuery;

    input.addEventListener("input", () => {
      this.searchQuery = input.value;
      this.render();
    });

    // Preserve focus after re-render
    requestAnimationFrame(() => {
      if (this.searchQuery) {
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
      }
    });

    if (this.searchQuery) {
      const clearBtn = row.createEl("button", {
        cls: "g-command-search-clear clickable-icon",
        attr: { "aria-label": "Clear search" },
      });
      clearBtn.textContent = "✕";
      clearBtn.addEventListener("click", () => {
        this.searchQuery = "";
        this.allFiles = null;
        this.render();
      });
    }
  }

  private renderSearchAllButton(parent: HTMLElement): void {
    const btn = parent.createEl("button", {
      cls: "g-command-search-all-btn",
      text: this.searchingAll ? "Searching…" : "Search all of Drive",
    });
    btn.disabled = this.searchingAll;

    btn.addEventListener("click", async () => {
      this.searchingAll = true;
      this.render();
      try {
        this.allFiles = await this.drive.listRecursive("");
        console.log("[G Command] Search all: loaded", this.allFiles.length, "files");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[G Command] Search all failed:", msg);
        this.error = new Error(`Search failed: ${msg}`);
      } finally {
        this.searchingAll = false;
        this.render();
      }
    });
  }

  private renderStatusLine(parent: HTMLElement): void {
    let text: string;
    if (this.syncing) {
      text = "Syncing…";
    } else if (this.selectedPaths.size > 0) {
      text = `${this.selectedPaths.size} file(s) selected`;
    } else {
      text = "Read only access to Google Drive documents, in Markdown or CSV.";
    }
    parent.createDiv({ cls: "g-command-status", text });
  }

  private renderSyncedPane(parent: HTMLElement): void {
    const pane = parent.createDiv({ cls: "g-command-synced-pane" });
    const entries = Object.entries(this.settings.syncState);
    pane.createDiv({
      cls: "g-command-section-header",
      text: `Synced files (${entries.length})`,
    });

    const body = pane.createDiv({ cls: "g-command-synced-body" });
    for (const [drivePath, rec] of entries) {
      this.renderSyncedRow(body, drivePath, rec);
    }
  }

  private renderSyncedRow(parent: HTMLElement, drivePath: string, rec: SyncRecord): void {
    const row = parent.createDiv({ cls: "g-command-synced-row" });

    // Display the vault filename (last segment of vault path, or drive path)
    const displayName = (rec.vaultPath ?? drivePath).split("/").pop() ?? drivePath;
    row.createSpan({ cls: "g-command-synced-name", text: displayName });

    // Resync button
    const btn = row.createEl("button", {
      cls: "g-command-resync-btn clickable-icon",
      attr: { "aria-label": `Resync ${displayName}` },
    });
    btn.textContent = "↻";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const name = drivePath.split("/").pop() ?? drivePath;
      const stub: DriveFile = {
        Path: drivePath,
        Name: name,
        Size: -1,
        MimeType: rec.mimeType ?? "",
        ModTime: "",
        IsDir: false,
        ID: rec.fileId,
      };
      this.runSync([stub]);
    });
  }

  private renderLogPane(parent: HTMLElement): void {
    const pane = parent.createDiv({ cls: "g-command-log-pane" });

    // Header with toggle
    const header = pane.createDiv({ cls: "g-command-log-header" });
    const arrow = header.createSpan({ cls: "g-command-log-arrow", text: this.logCollapsed ? "▶" : "▼" });
    header.createDiv({ cls: `g-command-log-status g-command-log-status--${this.syncStatus}` });
    header.createSpan({ text: `Sync log (${this.logEntries.length})` });

    const clearBtn = header.createEl("button", {
      cls: "g-command-log-clear clickable-icon",
      attr: { "aria-label": "Clear log" },
    });
    clearBtn.textContent = "✕";
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.logEntries = [];
      this.syncStatus = "idle";
      this.render();
    });

    header.addEventListener("click", () => {
      this.logCollapsed = !this.logCollapsed;
      this.render();
    });

    if (!this.logCollapsed) {
      const body = pane.createDiv({ cls: "g-command-log-body" });
      for (const entry of this.logEntries) {
        const row = body.createDiv({
          cls: `g-command-log-entry ${entry.level === "error" ? "g-command-log-entry--error" : ""}`,
        });
        row.createSpan({ cls: "g-command-log-time", text: entry.time });
        row.createSpan({ text: entry.message });
      }
      // Scroll to bottom
      requestAnimationFrame(() => {
        body.scrollTop = body.scrollHeight;
      });
    }
  }

  private renderErrorBanner(parent: HTMLElement): void {
    const err = this.error!;
    const banner = parent.createDiv({ cls: "g-command-error-banner" });

    if (err instanceof DriveError) {
      this.renderDriveError(banner, err);
    } else {
      banner.createDiv({ cls: "g-command-error-title", text: err.message });
    }
  }

  private renderDriveError(banner: HTMLElement, err: DriveError): void {
    banner.createDiv({
      cls: "g-command-error-title",
      text: "Authenticate with Google Drive",
    });

    const commands =
      err.code === "binary-missing"
        ? "brew install rclone\nrclone config"
        : "rclone config";

    const detail =
      err.code === "binary-missing"
        ? "Install and authenticate with rclone:"
        : err.message;

    banner.createEl("p", { text: detail });

    // Code block with commands
    const codeWrap = banner.createDiv({ cls: "g-command-code-block" });
    const pre = codeWrap.createEl("pre");
    pre.createEl("code", { text: commands });

    const copyBtn = codeWrap.createEl("button", {
      cls: "g-command-copy-btn clickable-icon",
      attr: { "aria-label": "Copy to clipboard" },
    });
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(commands);
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
    });

    banner.createEl("p", {
      cls: "g-command-error-ref",
      text: `See: ${this.pluginDir}/README.md`,
    });
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
    // Checkbox for folder selection (recursive sync)
    const cb = row.createEl("input", {
      cls: "g-command-checkbox",
      attr: { type: "checkbox" },
    }) as HTMLInputElement;
    cb.checked = this.selectedPaths.has(node.file.Path);
    cb.addEventListener("change", (e) => {
      e.stopPropagation();
      if (cb.checked) this.selectedPaths.add(node.file.Path);
      else this.selectedPaths.delete(node.file.Path);
      this.persistSelectedPaths();
      this.render();
    });

    // Expand/collapse arrow
    const arrow = row.createSpan({ cls: "g-command-arrow" });
    arrow.textContent = node.expanded ? "▼" : "▶";

    row.createSpan({ cls: "g-command-name", text: node.file.Name });
    row.addClass("g-command-row--folder");

    row.addEventListener("click", async (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
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
    // Checkbox for file selection
    const cb = row.createEl("input", {
      cls: "g-command-checkbox",
      attr: { type: "checkbox" },
    }) as HTMLInputElement;
    cb.checked = this.selectedPaths.has(node.file.Path);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        this.selectedPaths.add(node.file.Path);
      } else {
        this.selectedPaths.delete(node.file.Path);
      }
      this.persistSelectedPaths();
      this.render();
    });

    row.createSpan({ cls: "g-command-name", text: node.file.Name });

    // Sync badge for previously synced files
    if (this.settings.syncState[node.file.Path]) {
      row.createSpan({ cls: "g-command-sync-badge", text: "✓" });
    }

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

/**
 * Filter tree nodes by name, keeping ancestors of matching descendants.
 * Only walks loaded children (non-null). Case-insensitive.
 */
export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const lq = query.toLowerCase();
  const result: TreeNode[] = [];

  for (const node of nodes) {
    const nameMatch = node.file.Name.toLowerCase().includes(lq);

    if (node.file.IsDir && node.children && node.children.length > 0) {
      const filteredChildren = filterTree(node.children, query);
      if (nameMatch || filteredChildren.length > 0) {
        result.push({
          file: node.file,
          children: filteredChildren.length > 0 ? filteredChildren : node.children,
          expanded: nameMatch || filteredChildren.length > 0,
        });
      }
    } else if (nameMatch) {
      result.push(node);
    }
  }

  return result;
}

/**
 * Flatten a recursive DriveFile list into sorted TreeNodes for search-all results.
 */
export function flattenToNodes(files: DriveFile[]): TreeNode[] {
  return files.sort(sortDirsFirst).map(toTreeNode);
}
