import { ItemView, WorkspaceLeaf, Menu } from "obsidian";
import { HugoScanner } from "./HugoScanner";
import { HugoContentItem, StatusFilter, HugoCommandSettings } from "./types";
import { formatDate, openFile, LOGO_PREFIX } from "./utils";

export const VIEW_TYPE_HUGO_SIDEBAR = "hugo-command-sidebar";

export class HugoSidebarView extends ItemView {
  private scanner: HugoScanner;
  private settings: HugoCommandSettings;
  private updateListener: (() => void) | null = null;
  private activeTagFilter: string | null = null;
  private activeFolderTagFilter: string | null = null;
  private activeStatusFilter: StatusFilter;
  private searchQuery: string = "";
  private collapsedFolders: Set<string> = new Set();
  private openDropdown: HTMLElement | null = null;
  private openInfoPopup: HTMLElement | null = null;
  private onShowAbout: () => void;
  private onOpenSettings: () => void;

  constructor(
    leaf: WorkspaceLeaf,
    scanner: HugoScanner,
    settings: HugoCommandSettings,
    onShowAbout: () => void,
    onOpenSettings: () => void
  ) {
    super(leaf);
    this.scanner = scanner;
    this.settings = settings;
    this.activeStatusFilter = settings.defaultStatusFilter;
    this.onShowAbout = onShowAbout;
    this.onOpenSettings = onOpenSettings;
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
    this.closeInfoPopup();
  }

  private closeDropdown(): void {
    if (this.openDropdown) {
      this.openDropdown.remove();
      this.openDropdown = null;
    }
  }

  private closeInfoPopup(): void {
    if (this.openInfoPopup) {
      this.openInfoPopup.remove();
      this.openInfoPopup = null;
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
      text: "Hugo Command",
    });

    // Kebab menu button (three vertical dots)
    const menuBtn = header.createEl("button", {
      cls: "clickable-icon hugo-command-menu-btn",
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
            await this.scanner.scanVault();
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

  private renderFilters(container: HTMLElement): void {
    const filterBar = container.createEl("div", { cls: "hugo-command-filters" });

    // "Filter:" label at the start
    filterBar.createEl("span", {
      cls: "hugo-command-filter-prefix",
      text: "",
    });

    // Order: Folder → Tags → Status

    // Folder filter button
    const folderHierarchy = this.scanner.getFolderHierarchy();
    if (folderHierarchy.length > 0) {
      this.renderFolderFilterButton(filterBar, folderHierarchy);
    }

    // Tag filter button (frontmatter tags)
    const allTags = this.scanner.getAllTags();
    if (allTags.length > 0) {
      this.renderTagFilterButton(filterBar, allTags);
    }

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

    // Search field with embedded filter chips
    this.renderSearchField(filterBar);

    // Info icon for count display (pushed to right)
    const counts = this.scanner.getCount();
    const infoIcon = filterBar.createEl("span", {
      cls: "hugo-command-info-icon",
      text: "\u24d8",
      attr: { "aria-label": "Content stats" },
    });

    infoIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeInfoPopup();
      this.closeDropdown();

      const popup = document.createElement("div");
      popup.className = "hugo-command-info-popup";

      const rect = infoIcon.getBoundingClientRect();
      popup.style.position = "fixed";
      popup.style.top = `${rect.bottom + 4}px`;
      popup.style.right = `${window.innerWidth - rect.right}px`;

      popup.createEl("div", {
        cls: "hugo-command-info-row",
        text: `${counts.published} published`,
      });
      popup.createEl("div", {
        cls: "hugo-command-info-row",
        text: `${counts.drafts} drafts`,
      });
      popup.createEl("div", {
        cls: "hugo-command-info-row total",
        text: `${counts.total} total`,
      });

      document.body.appendChild(popup);
      this.openInfoPopup = popup;

      const closeHandler = (e: MouseEvent) => {
        if (!popup.contains(e.target as Node) && e.target !== infoIcon) {
          this.closeInfoPopup();
          document.removeEventListener("click", closeHandler);
        }
      };
      setTimeout(() => document.addEventListener("click", closeHandler), 0);
    });
  }

  private renderSearchField(container: HTMLElement): void {
    const searchContainer = container.createEl("div", {
      cls: "hugo-command-search-container",
    });

    // Show active folder filter as chip inside search
    if (this.activeFolderTagFilter) {
      const chip = searchContainer.createEl("span", {
        cls: "hugo-command-search-chip folder-chip",
      });
      chip.createEl("span", { text: this.activeFolderTagFilter });
      const clearBtn = chip.createEl("span", {
        cls: "hugo-command-search-chip-clear",
        text: "\u00d7",
      });
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.activeFolderTagFilter = null;
        this.render();
      });
    }

    // Show active tag filter as chip inside search
    if (this.activeTagFilter) {
      const chip = searchContainer.createEl("span", {
        cls: "hugo-command-search-chip",
      });
      chip.createEl("span", { text: this.activeTagFilter });
      const clearBtn = chip.createEl("span", {
        cls: "hugo-command-search-chip-clear",
        text: "\u00d7",
      });
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.activeTagFilter = null;
        this.render();
      });
    }

    // Search input
    const searchInput = searchContainer.createEl("input", {
      cls: "hugo-command-search-input",
      attr: {
        type: "text",
        placeholder: "Search...",
      },
    });
    searchInput.value = this.searchQuery;

    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.render();
    });

    // Restore focus after render if there was a search query
    if (this.searchQuery) {
      setTimeout(() => {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }, 0);
    }

    // Clear all button (only show if there's something to clear)
    const hasFilters = this.activeTagFilter || this.activeFolderTagFilter || this.searchQuery;
    if (hasFilters) {
      const clearAll = searchContainer.createEl("span", {
        cls: "hugo-command-search-clear",
        text: "\u00d7",
      });
      clearAll.addEventListener("click", (e) => {
        e.stopPropagation();
        this.activeTagFilter = null;
        this.activeFolderTagFilter = null;
        this.searchQuery = "";
        this.render();
      });
    }
  }

  private renderTagFilterButton(
    container: HTMLElement,
    allTags: string[]
  ): void {
    const trigger = container.createEl("span", {
      cls: "hugo-command-filter-trigger",
    });
    // Tag icon SVG
    trigger.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg><span>Tags</span>';

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

  private renderFolderFilterButton(
    container: HTMLElement,
    folderHierarchy: { name: string; path: string; depth: number }[]
  ): void {
    const trigger = container.createEl("span", {
      cls: "hugo-command-filter-trigger",
    });
    // SVG folder icon with label
    trigger.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><span>Folder</span>';

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeDropdown();

      const dropdown = document.createElement("div");
      dropdown.className = "hugo-command-tag-dropdown";

      const rect = trigger.getBoundingClientRect();
      dropdown.style.position = "fixed";
      dropdown.style.top = `${rect.bottom + 4}px`;
      dropdown.style.left = `${rect.left}px`;

      for (const folder of folderHierarchy) {
        const depthClass = `folder-depth-${Math.min(folder.depth, 4)}`;
        const folderItem = dropdown.createEl("div", {
          cls: `hugo-command-tag-item folder-tag ${depthClass}`,
          text: folder.name,
        });

        if (folder.path === this.activeFolderTagFilter) {
          folderItem.addClass("active");
        }

        folderItem.addEventListener("click", (e) => {
          e.stopPropagation();
          this.activeFolderTagFilter = folder.path === this.activeFolderTagFilter ? null : folder.path;
          this.closeDropdown();
          this.render();
        });
      }

      if (this.activeFolderTagFilter) {
        dropdown.createEl("div", { cls: "hugo-command-tag-separator" });
        const clearItem = dropdown.createEl("div", {
          cls: "hugo-command-tag-item clear",
          text: "Clear filter",
        });
        clearItem.addEventListener("click", (e) => {
          e.stopPropagation();
          this.activeFolderTagFilter = null;
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
    let items = this.scanner.getContentSorted(this.settings.defaultSortOrder);

    // Apply status filter
    if (this.activeStatusFilter === "draft") {
      items = items.filter((item) => item.isDraft);
    } else if (this.activeStatusFilter === "published") {
      items = items.filter((item) => !item.isDraft);
    }

    // Apply tag filter (frontmatter tags)
    if (this.activeTagFilter) {
      items = items.filter(
        (item) =>
          item.tags.includes(this.activeTagFilter!) ||
          item.categories.includes(this.activeTagFilter!)
      );
    }

    // Apply folder filter (matches full folder path or any subfolder)
    if (this.activeFolderTagFilter) {
      items = items.filter((item) => {
        // Build the item's full folder path
        const itemPath = item.topLevelFolder === "(root)"
          ? ""
          : item.folderTags.length > 0
            ? `${item.topLevelFolder}/${item.folderTags.join("/")}`
            : item.topLevelFolder;

        // Match if item is in the selected folder or any subfolder
        return (
          itemPath === this.activeFolderTagFilter ||
          itemPath.startsWith(this.activeFolderTagFilter + "/")
        );
      });
    }

    // Apply search query filter (title, tags, description)
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      items = items.filter((item) => {
        // Search in title
        if (item.title.toLowerCase().includes(query)) return true;
        // Search in tags
        if (item.tags.some((tag) => tag.toLowerCase().includes(query))) return true;
        // Search in categories
        if (item.categories.some((cat) => cat.toLowerCase().includes(query))) return true;
        // Search in description
        if (item.description && item.description.toLowerCase().includes(query)) return true;
        return false;
      });
    }

    // Apply drafts visibility from settings
    if (!this.settings.showDrafts && this.activeStatusFilter === "all") {
      items = items.filter((item) => !item.isDraft);
    }

    if (items.length === 0) {
      const emptyDiv = container.createEl("div", {
        cls: "hugo-command-empty",
        text: "No content found",
      });
      return;
    }

    // Group items by top-level folder
    const folders = this.scanner.getTopLevelFolders();
    const groupedItems = new Map<string, HugoContentItem[]>();

    for (const folder of folders) {
      groupedItems.set(folder, []);
    }

    for (const item of items) {
      const folderItems = groupedItems.get(item.topLevelFolder);
      if (folderItems) {
        folderItems.push(item);
      }
    }

    // Render each folder group
    for (const folder of folders) {
      const folderItems = groupedItems.get(folder) || [];
      if (folderItems.length === 0) continue;

      this.renderFolderGroup(container, folder, folderItems);
    }
  }

  private renderFolderGroup(
    container: HTMLElement,
    folder: string,
    items: HugoContentItem[]
  ): void {
    const group = container.createEl("div", { cls: "hugo-command-folder-group" });
    const isCollapsed = this.collapsedFolders.has(folder);

    // Folder header
    const header = group.createEl("div", {
      cls: `hugo-command-folder-header ${isCollapsed ? "collapsed" : ""}`,
    });

    const chevron = header.createEl("span", {
      cls: "hugo-command-folder-chevron",
      text: isCollapsed ? "\u25b8" : "\u25be",
    });

    header.createEl("span", {
      cls: "hugo-command-folder-name",
      text: folder,
    });

    header.createEl("span", {
      cls: "hugo-command-folder-count",
      text: `(${items.length})`,
    });

    header.addEventListener("click", () => {
      if (this.collapsedFolders.has(folder)) {
        this.collapsedFolders.delete(folder);
      } else {
        this.collapsedFolders.add(folder);
      }
      this.render();
    });

    // Content list (if not collapsed)
    if (!isCollapsed) {
      const list = group.createEl("ul", { cls: "hugo-command-list" });
      for (const item of items) {
        this.renderContentItem(list, item);
      }
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

    // Tags dropdown (if has any tags - frontmatter or folder)
    const frontmatterTags = [...item.tags, ...item.categories];
    const folderTags = item.folderTags;
    if (frontmatterTags.length > 0 || folderTags.length > 0) {
      this.renderItemTagDropdown(listItem, frontmatterTags, folderTags);
    }

    // Date (rightmost)
    if (item.date) {
      listItem.createEl("span", {
        cls: "hugo-command-item-date",
        text: formatDate(item.date),
      });
    }
  }

  private renderItemTagDropdown(
    container: HTMLElement,
    frontmatterTags: string[],
    folderTags: string[]
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

      // Folder tags section
      if (folderTags.length > 0) {
        dropdown.createEl("div", {
          cls: "hugo-command-tag-section-header",
          text: "Folders",
        });

        for (const tag of folderTags) {
          const tagItem = dropdown.createEl("div", {
            cls: "hugo-command-tag-item folder-tag",
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
            this.activeFolderTagFilter = tag;
            this.closeDropdown();
            this.render();
          });
        }
      }

      // Frontmatter tags section
      if (frontmatterTags.length > 0) {
        if (folderTags.length > 0) {
          dropdown.createEl("div", { cls: "hugo-command-tag-separator" });
        }

        dropdown.createEl("div", {
          cls: "hugo-command-tag-section-header",
          text: "Tags",
        });

        for (const tag of frontmatterTags) {
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
