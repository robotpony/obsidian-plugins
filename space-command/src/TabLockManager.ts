import { App, WorkspaceLeaf } from "obsidian";

/**
 * Manages tab lock buttons in Obsidian's tab headers.
 * Uses Obsidian's native pinning API - pinned tabs force link clicks to open in new tabs.
 */
export class TabLockManager {
  private app: App;
  private enabled: boolean = false;
  private mutationObserver: MutationObserver | null = null;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Enable the tab lock feature - adds lock buttons to all tab headers.
   */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    // Add buttons to existing tabs
    this.updateAllTabs();

    // Watch for new tabs being created
    this.startObserving();
  }

  /**
   * Disable the tab lock feature - removes all lock buttons.
   */
  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    this.stopObserving();
    this.removeAllButtons();
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.disable();
  }

  /**
   * Update all existing tabs with lock buttons.
   */
  private updateAllTabs(): void {
    // Get all workspace leaves (tabs)
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      this.addButtonToLeaf(leaf);
    }

    // Also check for other leaf types that might have tab headers
    const allLeaves = this.getAllLeaves();
    for (const leaf of allLeaves) {
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
    if (!tabHeader) return;

    // Verify this is actually a tab header (has the workspace-tab-header class)
    // This prevents matching toolbar icons which have similar internal structure
    if (!tabHeader.classList.contains("workspace-tab-header")) return;

    // Only add to markdown document tabs, not sidebar tabs (bookmarks, file explorer, etc.)
    // Document tabs have data-type="markdown", sidebar tabs have data-type="bookmarks", etc.
    const dataType = tabHeader.getAttribute("data-type");
    if (dataType !== "markdown") return;

    // Don't add button if one already exists
    if (tabHeader.querySelector(".space-command-tab-lock-btn")) return;

    // Find the inner container where we'll insert the button
    const innerContainer = tabHeader.querySelector(".workspace-tab-header-inner");
    if (!innerContainer) return;

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

    // Handle click on lock button to pin
    lockBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();

      // Toggle pinned state
      // @ts-expect-error - pinned is not in the public API
      const currentlyPinned = leaf.pinned === true;
      leaf.setPinned(!currentlyPinned);

      // Update button appearance
      this.updateButtonState(lockBtn, !currentlyPinned);
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
   * The pin icon appears when the tab is pinned.
   */
  private addPinClickHandler(
    tabHeader: HTMLElement,
    leaf: WorkspaceLeaf,
    lockBtn: HTMLElement
  ): void {
    // Find the pin status container (contains the pushpin icon)
    const pinContainer = tabHeader.querySelector(
      ".workspace-tab-header-status-container"
    );
    if (!pinContainer) return;

    // Don't add handler if already present
    if (pinContainer.hasAttribute("data-space-command-pin-handler")) return;
    pinContainer.setAttribute("data-space-command-pin-handler", "true");

    pinContainer.addEventListener("click", (e) => {
      // Only handle if the tab is currently pinned
      // @ts-expect-error - pinned is not in the public API
      if (!leaf.pinned) return;

      e.stopPropagation();
      e.preventDefault();

      // Unpin the tab
      leaf.setPinned(false);

      // Update button appearance
      this.updateButtonState(lockBtn, false);
    });
  }

  /**
   * Update the button's visual state based on pinned status.
   * When locked: hide the lock button and close button, let Obsidian's native pushpin show.
   * When unlocked: show the lock button (open padlock) and close button.
   */
  private updateButtonState(button: HTMLElement, isPinned: boolean): void {
    button.classList.toggle("is-locked", isPinned);
    button.setAttribute("aria-label", isPinned ? "Unlock tab" : "Lock tab");

    // Add/remove class on the tab header to control close button visibility via CSS
    const tabHeader = button.closest(".workspace-tab-header") as HTMLElement;
    if (tabHeader) {
      tabHeader.classList.toggle("space-command-tab-locked", isPinned);
    }

    // Always show open padlock icon - when locked, the button is hidden via CSS
    // and Obsidian's native pushpin indicates the locked state
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
  }

  /**
   * Remove all lock buttons and cleanup tab header classes.
   */
  private removeAllButtons(): void {
    // Remove lock buttons
    const buttons = document.querySelectorAll(".space-command-tab-lock-btn");
    buttons.forEach((btn) => btn.remove());

    // Remove locked class from tab headers
    const lockedTabs = document.querySelectorAll(".space-command-tab-locked");
    lockedTabs.forEach((tab) =>
      tab.classList.remove("space-command-tab-locked")
    );

    // Remove pin handler markers
    const pinContainers = document.querySelectorAll(
      "[data-space-command-pin-handler]"
    );
    pinContainers.forEach((container) =>
      container.removeAttribute("data-space-command-pin-handler")
    );
  }

  /**
   * Start observing DOM changes to add buttons to new tabs.
   */
  private startObserving(): void {
    if (this.mutationObserver) return;

    this.mutationObserver = new MutationObserver((mutations) => {
      // Check if any new tab headers were added
      let shouldUpdate = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof HTMLElement) {
              if (
                node.classList?.contains("workspace-tab-header") ||
                node.querySelector?.(".workspace-tab-header")
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
        // Debounce updates
        setTimeout(() => this.updateAllTabs(), 50);
      }
    });

    // Observe the workspace container for new tabs
    const workspaceContainer = document.querySelector(".workspace");
    if (workspaceContainer) {
      this.mutationObserver.observe(workspaceContainer, {
        childList: true,
        subtree: true,
      });
    }
  }

  /**
   * Stop observing DOM changes.
   */
  private stopObserving(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }
}
