import { App, WorkspaceLeaf, EventRef } from "obsidian";

/**
 * Manages tab lock buttons in Obsidian's tab headers.
 * Uses Obsidian's native pinning API - pinned tabs force link clicks to open in new tabs.
 *
 * Uses a hybrid approach: workspace events for reliable detection + MutationObserver
 * as a fallback to catch DOM changes that happen after events fire.
 */
export class TabLockManager {
  private app: App;
  private enabled: boolean = false;
  private eventRefs: EventRef[] = [];
  private mutationObserver: MutationObserver | null = null;
  private updateTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Enable the tab lock feature - adds lock buttons to all tab headers.
   */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    console.log("[TabLockManager] Enabling...");

    // Add buttons to existing tabs
    this.updateAllTabs();

    // Re-check after delays to catch tabs that weren't fully initialized
    setTimeout(() => this.updateAllTabs(), 100);
    setTimeout(() => this.updateAllTabs(), 500);

    // Listen for workspace events
    this.registerEvents();

    // Also use MutationObserver as fallback for DOM changes
    this.startObserving();

    console.log("[TabLockManager] Enabled");
  }

  /**
   * Disable the tab lock feature - removes all lock buttons.
   */
  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    this.unregisterEvents();
    this.stopObserving();
    this.removeAllButtons();

    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.disable();
  }

  /**
   * Register workspace events to detect tab changes.
   */
  private registerEvents(): void {
    // layout-change fires when tabs are opened, closed, moved, or split
    const layoutRef = this.app.workspace.on("layout-change", () => {
      this.scheduleUpdate();
    });
    this.eventRefs.push(layoutRef);

    // active-leaf-change fires when user switches tabs
    const activeLeafRef = this.app.workspace.on("active-leaf-change", () => {
      this.scheduleUpdate();
    });
    this.eventRefs.push(activeLeafRef);

    // file-open fires when a file is opened (including in existing tabs)
    const fileOpenRef = this.app.workspace.on("file-open", () => {
      this.scheduleUpdate();
    });
    this.eventRefs.push(fileOpenRef);
  }

  /**
   * Unregister all workspace events.
   */
  private unregisterEvents(): void {
    for (const ref of this.eventRefs) {
      this.app.workspace.offref(ref);
    }
    this.eventRefs = [];
  }

  /**
   * Start MutationObserver to catch DOM changes.
   */
  private startObserving(): void {
    if (this.mutationObserver) return;

    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof HTMLElement) {
              if (
                node.classList?.contains("workspace-tab-header") ||
                node.querySelector?.(".workspace-tab-header") ||
                node.classList?.contains("workspace-tab-header-inner") ||
                node.closest?.(".workspace-tab-header")
              ) {
                shouldUpdate = true;
                break;
              }
            }
          }
        }
        if (shouldUpdate) break;
      }

      if (shouldUpdate) {
        this.scheduleUpdate();
      }
    });

    const workspaceContainer = document.querySelector(".workspace");
    if (workspaceContainer) {
      this.mutationObserver.observe(workspaceContainer, {
        childList: true,
        subtree: true,
      });
    }
  }

  /**
   * Stop MutationObserver.
   */
  private stopObserving(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  /**
   * Schedule a debounced update of all tabs.
   */
  private scheduleUpdate(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    this.updateTimeout = setTimeout(() => {
      this.updateTimeout = null;
      this.updateAllTabs();
    }, 50);
  }

  /**
   * Update all existing tabs with lock buttons.
   */
  private updateAllTabs(): void {
    if (!this.enabled) return;

    const leaves = this.getAllLeaves();
    console.log(`[TabLockManager] updateAllTabs: found ${leaves.length} leaves`);
    for (const leaf of leaves) {
      this.addButtonToLeaf(leaf);
    }
  }

  /**
   * Get all leaves in the workspace.
   */
  private getAllLeaves(): WorkspaceLeaf[] {
    const leaves: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      leaves.push(leaf);
    });
    return leaves;
  }

  /**
   * Add a lock button to a specific leaf's tab header.
   */
  private addButtonToLeaf(leaf: WorkspaceLeaf): void {
    if (!this.enabled) return;

    // Access the tab header element (undocumented but stable API)
    // @ts-expect-error - tabHeaderEl is not in the public API
    const tabHeader = leaf.tabHeaderEl as HTMLElement | undefined;
    if (!tabHeader) {
      console.log(`[TabLockManager] Leaf has no tabHeaderEl`, leaf.getViewState());
      return;
    }

    // Verify this is actually a tab header (has the workspace-tab-header class)
    if (!tabHeader.classList.contains("workspace-tab-header")) {
      console.log(`[TabLockManager] tabHeader missing workspace-tab-header class`, tabHeader.className);
      return;
    }

    // Only add to markdown document tabs, not sidebar tabs
    const dataType = tabHeader.getAttribute("data-type");
    if (dataType !== "markdown") {
      console.log(`[TabLockManager] Skipping non-markdown tab: data-type="${dataType}"`);
      return;
    }

    // Check for existing button - if present, just update its state
    const existingBtn = tabHeader.querySelector(".space-command-tab-lock-btn") as HTMLElement | null;
    if (existingBtn) {
      // Update state in case pinned status changed
      // @ts-expect-error - pinned is not in the public API
      const isPinned = leaf.pinned === true;
      this.updateButtonState(existingBtn, isPinned);
      return;
    }

    // Find the inner container where we'll insert the button
    const innerContainer = tabHeader.querySelector(".workspace-tab-header-inner");
    if (!innerContainer) {
      console.log(`[TabLockManager] No inner container found in tabHeader`);
      return;
    }

    console.log(`[TabLockManager] Adding button to leaf`);

    // Find the close button to insert before it
    const closeButton = innerContainer.querySelector(".workspace-tab-header-inner-close-button");

    // Create the lock button
    const lockBtn = document.createElement("div");
    lockBtn.className = "space-command-tab-lock-btn workspace-tab-header-status-icon";
    lockBtn.setAttribute("aria-label", "Lock tab (pinned tabs open links in new tabs)");

    // Set initial state based on leaf's pinned status
    // @ts-expect-error - pinned is not in the public API
    const isPinned = leaf.pinned === true;
    this.updateButtonState(lockBtn, isPinned);

    // Handle click on lock button to toggle pin
    lockBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();

      // @ts-expect-error - pinned is not in the public API
      const currentlyPinned = leaf.pinned === true;
      const newPinnedState = !currentlyPinned;
      leaf.setPinned(newPinnedState);

      // Update button appearance immediately
      this.updateButtonState(lockBtn, newPinnedState);
    });

    // Insert before the close button, or at the end if no close button
    if (closeButton) {
      innerContainer.insertBefore(lockBtn, closeButton);
    } else {
      innerContainer.appendChild(lockBtn);
    }

    // Add click handler to Obsidian's native pin icon to unpin
    this.addPinClickHandler(tabHeader, leaf, lockBtn);
  }

  /**
   * Add a click handler to Obsidian's native pin icon for unlocking.
   */
  private addPinClickHandler(
    tabHeader: HTMLElement,
    leaf: WorkspaceLeaf,
    lockBtn: HTMLElement
  ): void {
    const pinContainer = tabHeader.querySelector(
      ".workspace-tab-header-status-container"
    );
    if (!pinContainer) return;

    // Don't add handler if already present
    if (pinContainer.hasAttribute("data-space-command-pin-handler")) return;
    pinContainer.setAttribute("data-space-command-pin-handler", "true");

    pinContainer.addEventListener(
      "click",
      (e) => {
        // @ts-expect-error - pinned is not in the public API
        const wasPinned = leaf.pinned === true;
        if (!wasPinned) return;

        e.stopPropagation();
        e.preventDefault();

        leaf.setPinned(false);
        tabHeader.classList.remove("space-command-tab-locked");
        this.updateButtonState(lockBtn, false);
      },
      { capture: true }
    );
  }

  /**
   * Update the button's visual state based on pinned status.
   */
  private updateButtonState(button: HTMLElement, isPinned: boolean): void {
    button.classList.toggle("is-locked", isPinned);
    button.setAttribute("aria-label", isPinned ? "Unlock tab" : "Lock tab");

    const tabHeader = button.closest(".workspace-tab-header") as HTMLElement;
    if (tabHeader) {
      tabHeader.classList.toggle("space-command-tab-locked", isPinned);
    }

    // Open padlock icon - when locked, button is hidden via CSS
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
  }

  /**
   * Remove all lock buttons and cleanup.
   */
  private removeAllButtons(): void {
    const buttons = document.querySelectorAll(".space-command-tab-lock-btn");
    buttons.forEach((btn) => btn.remove());

    const lockedTabs = document.querySelectorAll(".space-command-tab-locked");
    lockedTabs.forEach((tab) =>
      tab.classList.remove("space-command-tab-locked")
    );

    const pinContainers = document.querySelectorAll(
      "[data-space-command-pin-handler]"
    );
    pinContainers.forEach((container) =>
      container.removeAttribute("data-space-command-pin-handler")
    );
  }
}
