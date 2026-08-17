import { App, ItemView, WorkspaceLeaf } from "obsidian";

/**
 * Interface for sidebar views that can be refreshed.
 * Sidebar views should implement render() for UI-only redraws.
 * Optionally implement reload() for full data refresh (e.g. reconnecting).
 */
export interface RefreshableView extends ItemView {
  render(): void;
  reload?(): Promise<void>;
}

/**
 * Manages sidebar lifecycle: activate, toggle, and refresh.
 * Reduces boilerplate code that was duplicated across plugins.
 *
 * @example
 * ```ts
 * const sidebar = new SidebarManager(this.app, VIEW_TYPE_TODO_SIDEBAR);
 *
 * // In onload()
 * if (this.settings.showSidebarByDefault) {
 *   this.app.workspace.onLayoutReady(() => sidebar.activate());
 * }
 *
 * // For commands
 * this.addCommand({
 *   id: "toggle-sidebar",
 *   name: "Toggle Sidebar",
 *   callback: () => sidebar.toggle(),
 * });
 * ```
 */
export class SidebarManager {
  constructor(
    private app: App,
    private viewType: string
  ) {}

  /**
   * Activate the sidebar view (create if needed, reveal if exists).
   */
  async activate(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(this.viewType);

    if (leaves.length > 0) {
      // Sidebar already exists
      leaf = leaves[0];
    } else {
      // Create new sidebar in right panel
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({
          type: this.viewType,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  /**
   * Toggle the sidebar view (close if open, open if closed).
   */
  async toggle(): Promise<void> {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(this.viewType);

    if (leaves.length > 0) {
      // Close all instances
      leaves.forEach((leaf) => leaf.detach());
    } else {
      // Open sidebar
      await this.activate();
    }
  }

  /**
   * Refresh all instances of the sidebar view.
   * Calls reload() if available (full data refresh), otherwise render().
   */
  refresh(): void {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(this.viewType);

    for (const leaf of leaves) {
      const view = leaf.view;
      if (view && "reload" in view && typeof view.reload === "function") {
        (view as RefreshableView).reload!();
      } else if (view && "render" in view && typeof view.render === "function") {
        (view as RefreshableView).render();
      }
    }
  }

  /**
   * Get the first leaf of this sidebar type, if any.
   */
  getLeaf(): WorkspaceLeaf | null {
    const leaves = this.app.workspace.getLeavesOfType(this.viewType);
    return leaves.length > 0 ? leaves[0] : null;
  }

  /**
   * Get the view instance from the first leaf, if any.
   */
  getView<T extends ItemView>(): T | null {
    const leaf = this.getLeaf();
    return leaf ? (leaf.view as T) : null;
  }

  /**
   * Execute a callback on each sidebar view instance.
   */
  forEach<T extends ItemView>(callback: (view: T) => void): void {
    const leaves = this.app.workspace.getLeavesOfType(this.viewType);
    for (const leaf of leaves) {
      callback(leaf.view as T);
    }
  }
}
