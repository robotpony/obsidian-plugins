import { ItemView, WorkspaceLeaf } from "obsidian";
import { HugoScanner } from "./HugoScanner";
import { HugoContentItem, StatusFilter, HugoCommandSettings } from "./types";
import { formatDate, openFile, LOGO_PREFIX } from "./utils";

export const VIEW_TYPE_HUGO_SIDEBAR = "hugo-command-sidebar";

export class HugoSidebarView extends ItemView {
  private scanner: HugoScanner;
  private settings: HugoCommandSettings;
  private updateListener: (() => void) | null = null;
  private activeTagFilter: string | null = null;
  private activeStatusFilter: StatusFilter = "all";
  private openDropdown: HTMLElement | null = null;
  private onShowAbout: () => void;

  constructor(
    leaf: WorkspaceLeaf,
    scanner: HugoScanner,
    settings: HugoCommandSettings,
    onShowAbout: () => void
  ) {
    super(leaf);
    this.scanner = scanner;
    this.settings = settings;
    this.onShowAbout = onShowAbout;
  }

  getViewType(): string {
    return VIEW_TYPE_HUGO_SIDEBAR;
  }

  getDisplayText(): string {
    return `${LOGO_PREFIX} Hugo`;
  }

  getIcon(): string {
    return "file-text";
  }

  async onOpen(): Promise<void> {
    this.updateListener = () => this.render();
    this.scanner.on("content-updated", this.updateListener);

    const hasContent = this.scanner.getContent().length > 0;
    if (!hasContent) {
      await this.scanner.scanVault();
    } else {
      this.render();
    }
  }

  async onClose(): Promise<void> {
    if (this.updateListener) {
      this.scanner.off("content-updated", this.updateListener);
      this.updateListener = null;
    }
    this.closeDropdown();
  }

  private closeDropdown(): void {
    if (this.openDropdown) {
      this.openDropdown.remove();
      this.openDropdown = null;
    }
  }

  render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("hugo-command-sidebar");

    this.renderHeader(container as HTMLElement);
    this.renderFilters(container as HTMLElement);
    this.renderContentList(container as HTMLElement);
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createEl("div", { cls: "hugo-command-header" });

    const logo = header.createEl("span", {
      cls: "hugo-command-logo clickable-logo",
      text: LOGO_PREFIX,
    });

    logo.addEventListener("click", () => {
      this.onShowAbout();
    });

    header.createEl("span", {
      cls: "hugo-command-title",
      text: "Hugo Content",
    });

    // Refresh button
    const refreshBtn = header.createEl("span", {
      cls: "hugo-command-refresh",
      text: "\u21bb",
    });
    refreshBtn.setAttribute("aria-label", "Refresh");
    refreshBtn.addEventListener("click", async () => {
      await this.scanner.scanVault();
    });
  }

  private renderFilters(container: HTMLElement): void {
    const filterBar = container.createEl("div", { cls: "hugo-command-filters" });

    // Status filter dropdown
    const statusSelect = filterBar.createEl("select", {
      cls: "hugo-command-status-filter",
    });

    const statusOptions: { value: StatusFilter; label: string }[] = [
      { value: "all", label: "All" },
      { value: "published", label: "Published" },
      { value: "draft", label: "Drafts" },
    ];

    for (const opt of statusOptions) {
      const option = statusSelect.createEl("option", {
        text: opt.label,
        value: opt.value,
      });
      if (opt.value === this.activeStatusFilter) {
        option.selected = true;
      }
    }

    statusSelect.addEventListener("change", () => {
      this.activeStatusFilter = statusSelect.value as StatusFilter;
      this.render();
    });

    // Tag filter button
    const allTags = this.scanner.getAllTags();
    if (allTags.length > 0) {
      this.renderTagFilterButton(filterBar, allTags);
    }

    // Show active tag filter
    if (this.activeTagFilter) {
      const activeTag = filterBar.createEl("span", {
        cls: "hugo-command-active-tag",
        text: this.activeTagFilter,
      });

      const clearBtn = activeTag.createEl("span", {
        cls: "hugo-command-clear-tag",
        text: "\u00d7",
      });
      clearBtn.addEventListener("click", () => {
        this.activeTagFilter = null;
        this.render();
      });
    }

    // Count display
    const counts = this.scanner.getCount();
    filterBar.createEl("span", {
      cls: "hugo-command-count",
      text: `${counts.published} published, ${counts.drafts} drafts`,
    });
  }

  private renderTagFilterButton(
    container: HTMLElement,
    allTags: string[]
  ): void {
    const trigger = container.createEl("span", {
      cls: "hugo-command-tag-trigger",
      text: "#",
    });

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeDropdown();

      const dropdown = document.createElement("div");
      dropdown.className = "hugo-command-tag-dropdown";

      const rect = trigger.getBoundingClientRect();
      dropdown.style.position = "fixed";
      dropdown.style.top = `${rect.bottom + 4}px`;
      dropdown.style.left = `${rect.left}px`;

      for (const tag of allTags) {
        const tagItem = dropdown.createEl("div", {
          cls: "hugo-command-tag-item",
          text: tag,
        });

        if (tag === this.activeTagFilter) {
          tagItem.addClass("active");
        }

        tagItem.addEventListener("click", (e) => {
          e.stopPropagation();
          this.activeTagFilter = tag === this.activeTagFilter ? null : tag;
          this.closeDropdown();
          this.render();
        });
      }

      if (this.activeTagFilter) {
        dropdown.createEl("div", { cls: "hugo-command-tag-separator" });
        const clearItem = dropdown.createEl("div", {
          cls: "hugo-command-tag-item clear",
          text: "Clear filter",
        });
        clearItem.addEventListener("click", (e) => {
          e.stopPropagation();
          this.activeTagFilter = null;
          this.closeDropdown();
          this.render();
        });
      }

      document.body.appendChild(dropdown);
      this.openDropdown = dropdown;

      const closeHandler = (e: MouseEvent) => {
        if (!dropdown.contains(e.target as Node) && e.target !== trigger) {
          this.closeDropdown();
          document.removeEventListener("click", closeHandler);
        }
      };
      setTimeout(() => document.addEventListener("click", closeHandler), 0);
    });
  }

  private renderContentList(container: HTMLElement): void {
    const list = container.createEl("ul", { cls: "hugo-command-list" });

    let items = this.scanner.getContentSorted(this.settings.defaultSortOrder);

    // Apply status filter
    if (this.activeStatusFilter === "draft") {
      items = items.filter((item) => item.isDraft);
    } else if (this.activeStatusFilter === "published") {
      items = items.filter((item) => !item.isDraft);
    }

    // Apply tag filter
    if (this.activeTagFilter) {
      items = items.filter(
        (item) =>
          item.tags.includes(this.activeTagFilter!) ||
          item.categories.includes(this.activeTagFilter!)
      );
    }

    // Apply drafts visibility from settings
    if (!this.settings.showDrafts && this.activeStatusFilter === "all") {
      items = items.filter((item) => !item.isDraft);
    }

    if (items.length === 0) {
      list.createEl("li", {
        cls: "hugo-command-empty",
        text: "No content found",
      });
      return;
    }

    for (const item of items) {
      this.renderContentItem(list, item);
    }
  }

  private renderContentItem(list: HTMLElement, item: HugoContentItem): void {
    const listItem = list.createEl("li", { cls: "hugo-command-item" });

    // Status badge
    const badge = listItem.createEl("span", {
      cls: `hugo-command-badge ${item.isDraft ? "draft" : "published"}`,
      text: item.isDraft ? "D" : "P",
    });
    badge.setAttribute("aria-label", item.isDraft ? "Draft" : "Published");

    // Title (clickable)
    const title = listItem.createEl("span", {
      cls: "hugo-command-item-title",
      text: item.title,
    });

    title.addEventListener("click", () => {
      openFile(this.app, item.file);
    });

    // Date
    if (item.date) {
      listItem.createEl("span", {
        cls: "hugo-command-item-date",
        text: formatDate(item.date),
      });
    }

    // Tags dropdown (if has tags)
    const allItemTags = [...item.tags, ...item.categories];
    if (allItemTags.length > 0) {
      this.renderItemTagDropdown(listItem, allItemTags);
    }
  }

  private renderItemTagDropdown(
    container: HTMLElement,
    tags: string[]
  ): void {
    const trigger = container.createEl("span", {
      cls: "hugo-command-item-tag-trigger",
      text: "#",
    });

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeDropdown();

      const dropdown = document.createElement("div");
      dropdown.className = "hugo-command-tag-dropdown";

      const rect = trigger.getBoundingClientRect();
      const sidebarRoot = this.leaf.getRoot();
      const isRightSidebar = sidebarRoot === this.app.workspace.rightSplit;

      dropdown.style.position = "fixed";
      dropdown.style.top = `${rect.bottom + 4}px`;

      if (isRightSidebar) {
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
      } else {
        dropdown.style.left = `${rect.left}px`;
      }

      for (const tag of tags) {
        const tagItem = dropdown.createEl("div", {
          cls: "hugo-command-tag-item",
        });

        tagItem.createEl("span", {
          cls: "hugo-command-tag-label",
          text: tag,
        });

        const filterBtn = tagItem.createEl("span", {
          cls: "hugo-command-tag-action",
          text: "Filter",
        });

        filterBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.activeTagFilter = tag;
          this.closeDropdown();
          this.render();
        });
      }

      document.body.appendChild(dropdown);
      this.openDropdown = dropdown;

      const closeHandler = (e: MouseEvent) => {
        if (!dropdown.contains(e.target as Node) && e.target !== trigger) {
          this.closeDropdown();
          document.removeEventListener("click", closeHandler);
        }
      };
      setTimeout(() => document.addEventListener("click", closeHandler), 0);
    });
  }

  /**
   * Update settings reference (called when settings change)
   */
  updateSettings(settings: HugoCommandSettings): void {
    this.settings = settings;
    this.render();
  }
}
