import { ItemView, WorkspaceLeaf, TFile, Menu, Modal, MarkdownRenderer, Component } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { TodoProcessor } from "./TodoProcessor";
import { ProjectManager } from "./ProjectManager";
import { TodoItem, ProjectInfo, ItemRenderConfig } from "./types";
import { ContextMenuHandler } from "./ContextMenuHandler";
import { getPriorityValue, compareTodoItems, openFileAtLine, extractTags, showNotice, getTagColourInfo } from "./utils";

export const VIEW_TYPE_TODO_SIDEBAR = "space-command-sidebar";

export class TodoSidebarView extends ItemView {
  private scanner: TodoScanner;
  private processor: TodoProcessor;
  private projectManager: ProjectManager;
  private defaultTodoneFile: string;
  private updateListener: (() => void) | null = null;
  private contextMenuHandler: ContextMenuHandler;
  private recentTodonesLimit: number;
  private activeTodosLimit: number;
  private focusListLimit: number;
  private focusModeIncludeProjects: boolean;
  private makeLinksClickable: boolean;
  private activeTab: 'todos' | 'ideas' = 'todos';
  private activeTagFilter: string | null = null;
  private focusModeEnabled: boolean = false;
  private openDropdown: HTMLElement | null = null;
  private openInfoPopup: HTMLElement | null = null;
  private onShowAbout: () => void;
  private onShowStats: () => void;

  constructor(
    leaf: WorkspaceLeaf,
    scanner: TodoScanner,
    processor: TodoProcessor,
    projectManager: ProjectManager,
    defaultTodoneFile: string,
    priorityTags: string[],
    recentTodonesLimit: number,
    activeTodosLimit: number,
    focusListLimit: number,
    focusModeIncludeProjects: boolean,
    makeLinksClickable: boolean,
    onShowAbout: () => void,
    onShowStats: () => void
  ) {
    super(leaf);
    this.scanner = scanner;
    this.processor = processor;
    this.projectManager = projectManager;
    this.defaultTodoneFile = defaultTodoneFile;
    this.recentTodonesLimit = recentTodonesLimit;
    this.activeTodosLimit = activeTodosLimit;
    this.focusListLimit = focusListLimit;
    this.focusModeIncludeProjects = focusModeIncludeProjects;
    this.makeLinksClickable = makeLinksClickable;
    this.onShowAbout = onShowAbout;
    this.onShowStats = onShowStats;

    // Initialize context menu handler
    this.contextMenuHandler = new ContextMenuHandler(
      this.app,
      processor,
      priorityTags
    );
  }

  getViewType(): string {
    return VIEW_TYPE_TODO_SIDEBAR;
  }

  getDisplayText(): string {
    return this.activeTab === 'todos' ? "TODOs" : "IDEAs";
  }

  getIcon(): string {
    return "square-check-big";
  }

  private stripMarkdownSyntax(text: string): string {
    let cleaned = text;
    // Remove heading markers (e.g., ####)
    cleaned = cleaned.replace(/^#{1,6}\s+/, "");
    // Remove task list markers
    cleaned = cleaned.replace(/^-\s*\[\s*\]\s*/, "");
    cleaned = cleaned.replace(/^-\s*\[x\]\s*/, "");
    // Remove unordered list markers
    cleaned = cleaned.replace(/^-\s+/, "");
    // Remove bold
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, "$1");
    // Remove italic (single asterisk)
    cleaned = cleaned.replace(/\*(.+?)\*/g, "$1");
    // Remove bold (double underscore)
    cleaned = cleaned.replace(/__(.+?)__/g, "$1");
    // Remove italic (single underscore)
    cleaned = cleaned.replace(/_(.+?)_/g, "$1");
    // Remove strikethrough
    cleaned = cleaned.replace(/~~(.+?)~~/g, "$1");
    // Remove inline code backticks but keep the content
    cleaned = cleaned.replace(/`(.+?)`/g, "$1");
    // Remove wiki links but keep the display text
    // [[page|alias]] -> alias, [[page]] -> page
    cleaned = cleaned.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, page, alias) => {
      return alias || page.split('#')[0]; // Use alias if present, otherwise page name without heading
    });
    // Remove markdown links but keep the text
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
    return cleaned;
  }

  // Extract completion date from text (@YYYY-MM-DD pattern)
  private extractCompletionDate(text: string): string | null {
    const match = text.match(/@(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  // Strip tags from text but preserve tags inside backticks (inline code)
  private stripTagsPreservingCode(text: string): string {
    // Strategy: temporarily replace inline code blocks, strip tags, then restore
    const codeBlocks: string[] = [];
    const placeholder = '\u0000CODE\u0000';

    // Extract and replace inline code blocks
    const textWithPlaceholders = text.replace(/`[^`]+`/g, (match) => {
      codeBlocks.push(match);
      return placeholder + (codeBlocks.length - 1) + placeholder;
    });

    // Strip tags from the text (now safe since code blocks are placeholders)
    const textWithoutTags = textWithPlaceholders.replace(/#[\w-]+/g, "");

    // Restore code blocks
    return textWithoutTags.replace(new RegExp(placeholder + '(\\d+)' + placeholder, 'g'), (_, index) => {
      return codeBlocks[parseInt(index)];
    });
  }

  // Render text with clickable links (simplified version for sidebar)
  private renderTextWithLinks(text: string, container: HTMLElement): void {
    // Strip markdown formatting but preserve link structure
    let processed = text
      .replace(/^#{1,6}\s+/, "")   // Remove heading markers
      .replace(/^-\s*\[\s*\]\s*/, "") // Remove task markers
      .replace(/^-\s*\[x\]\s*/, "")
      .replace(/^-\s+/, "");       // Remove list markers

    let remaining = processed;

    while (remaining.length > 0) {
      // Try to match links first (wiki or markdown)

      // Wiki links: [[page]] or [[page|alias]]
      let match = remaining.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
      if (match) {
        const pagePath = match[1];
        const alias = match[2];
        const displayText = alias || pagePath.split('#')[0];

        const link = container.createEl('a', {
          text: displayText,
          cls: 'internal-link',
        });

        link.addEventListener('click', async (e) => {
          e.preventDefault();
          await this.app.workspace.openLinkText(pagePath, '', false);
        });

        remaining = remaining.substring(match[0].length);
        continue;
      }

      // Markdown links: [text](url)
      match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        const linkText = match[1];
        const url = match[2];

        const link = container.createEl('a', {
          text: linkText,
          cls: 'external-link',
        });

        link.addEventListener('click', (e) => {
          e.preventDefault();
          window.open(url, '_blank');
        });

        remaining = remaining.substring(match[0].length);
        continue;
      }

      // Bold: **text**
      match = remaining.match(/^\*\*(.+?)\*\*/);
      if (match) {
        container.createEl('strong', { text: match[1] });
        remaining = remaining.substring(match[0].length);
        continue;
      }

      // Italic: *text*
      match = remaining.match(/^\*(.+?)\*/);
      if (match) {
        container.createEl('em', { text: match[1] });
        remaining = remaining.substring(match[0].length);
        continue;
      }

      // Code: `text`
      match = remaining.match(/^`([^`]+)`/);
      if (match) {
        container.createEl('code', { text: match[1] });
        remaining = remaining.substring(match[0].length);
        continue;
      }

      // No pattern matched, consume characters until next special character
      const nextSpecial = remaining.search(/[\*`\[]/);
      if (nextSpecial === -1) {
        // No more special characters, add remaining text
        container.appendText(remaining);
        break;
      } else if (nextSpecial > 0) {
        // Add text before next special character
        container.appendText(remaining.substring(0, nextSpecial));
        remaining = remaining.substring(nextSpecial);
      } else {
        // Special character at start but didn't match, treat as literal
        container.appendText(remaining[0]);
        remaining = remaining.substring(1);
      }
    }
  }

  // Configuration for unified list item rendering
  private readonly todoConfig: ItemRenderConfig = {
    type: 'todo',
    classPrefix: 'todo',
    tagToStrip: /#todos?\b/g,
    showCheckbox: true,
    onComplete: (item) => this.processor.completeTodo(item, this.defaultTodoneFile),
    onContextMenu: (e, item) => this.contextMenuHandler.showTodoMenu(e, item, () => this.render())
  };

  private readonly ideaConfig: ItemRenderConfig = {
    type: 'idea',
    classPrefix: 'idea',
    tagToStrip: /#idea(?:s|tion)?\b/g,
    showCheckbox: true,
    onComplete: (item) => this.processor.completeIdea(item),
    onContextMenu: (e, item) => this.contextMenuHandler.showIdeaMenu(e, item, () => this.render())
  };

  private readonly principleConfig: ItemRenderConfig = {
    type: 'principle',
    classPrefix: 'principle',
    tagToStrip: /#principles?\b/g,
    showCheckbox: false,
    onContextMenu: (e, item) => this.contextMenuHandler.showPrincipleMenu(e, item)
  };


  // Unified list item renderer for todos, ideas, and principles
  // parentTags: optional tags inherited from a parent header block (for child items)
  private renderListItem(
    list: HTMLElement,
    item: TodoItem,
    config: ItemRenderConfig,
    isChild: boolean = false,
    parentTags: string[] = []
  ): void {
    const hasFocus = item.tags.includes("#focus");
    const isHeader = item.isHeader === true;
    const hasChildren = isHeader && item.childLineNumbers && item.childLineNumbers.length > 0;

    // Build class list with type-specific prefix
    const itemClasses = [
      `${config.classPrefix}-item`,
      hasFocus ? `${config.classPrefix}-focus` : '',
      isHeader ? `${config.classPrefix}-header` : '',
      isChild ? `${config.classPrefix}-child` : '',
      hasChildren ? `${config.classPrefix}-header-with-children` : ''
    ].filter(c => c).join(' ');

    const listItem = list.createEl("li", { cls: itemClasses });

    // Add context menu if configured
    if (config.onContextMenu) {
      listItem.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        config.onContextMenu!(e, item);
      });
    }

    // For headers with children, create a row container for the header content
    const rowContainer = hasChildren
      ? listItem.createEl("div", { cls: `${config.classPrefix}-header-row` })
      : listItem;

    // Checkbox (if configured)
    if (config.showCheckbox && config.onComplete) {
      const checkbox = rowContainer.createEl("input", {
        type: "checkbox",
        cls: `${config.classPrefix}-checkbox`,
      });

      checkbox.addEventListener("change", async () => {
        checkbox.disabled = true;
        const success = await config.onComplete!(item);
        if (!success) {
          checkbox.disabled = false;
        }
      });
    }

    // Text content (strip type tag and all other tags for display)
    const textSpan = rowContainer.createEl("span", { cls: `${config.classPrefix}-text` });
    const cleanText = item.text.replace(config.tagToStrip, "").trim();
    // Strip tags BEFORE markdown processing, but preserve tags inside backticks
    const textWithoutTags = this.stripTagsPreservingCode(cleanText);

    if (this.makeLinksClickable) {
      // Render with clickable links
      this.renderTextWithLinks(textWithoutTags, textSpan);
    } else {
      // Strip all markdown and render as plain text
      const displayText = this.stripMarkdownSyntax(textWithoutTags);
      const finalText = displayText.replace(/\s+/g, " ").trim();
      textSpan.appendText(finalText);
    }

    // Get tags (excluding the type tag) and merge with parent header tags for child items
    const itemTags = extractTags(cleanText).filter(tag => !config.tagToStrip.test(tag));
    // Merge parent tags with item tags, avoiding duplicates
    const mergedTags = [...new Set([...parentTags, ...itemTags])];
    if (mergedTags.length > 0) {
      this.renderTagDropdown(mergedTags, rowContainer, item);
    }

    // Link to source
    const link = rowContainer.createEl("a", {
      text: "→",
      cls: `${config.classPrefix}-link`,
      href: "#",
    });

    link.addEventListener("click", (e) => {
      e.preventDefault();
      openFileAtLine(this.app, item.file, item.lineNumber);
    });

    // If this is a header with children, render children indented below
    if (hasChildren) {
      const childrenContainer = listItem.createEl("ul", { cls: `${config.classPrefix}-children` });
      const allItems = this.getItemsForType(config.type);
      // Get parent header's tags to pass to children (excluding the type tag)
      const headerTags = extractTags(item.text).filter(tag => !config.tagToStrip.test(tag));
      for (const childLine of item.childLineNumbers!) {
        const childItem = allItems.find(
          t => t.filePath === item.filePath && t.lineNumber === childLine
        );
        if (childItem) {
          this.renderListItem(childrenContainer, childItem, config, true, headerTags);
        }
      }
    }
  }

  // Get all items of a given type for child lookup
  private getItemsForType(type: 'todo' | 'idea' | 'principle'): TodoItem[] {
    switch (type) {
      case 'todo': return this.scanner.getTodos();
      case 'idea': return this.scanner.getIdeas();
      case 'principle': return this.scanner.getPrinciples();
    }
  }

  // Close any open tag dropdown
  private closeDropdown(): void {
    if (this.openDropdown) {
      this.openDropdown.remove();
      this.openDropdown = null;
    }
  }

  // Get project colour map for tag colouring
  private getProjectColourMap(): Map<string, number> {
    const projects = this.projectManager.getProjects();
    const map = new Map<string, number>();
    for (const project of projects) {
      map.set(project.tag.toLowerCase(), project.colourIndex);
    }
    return map;
  }

  // Render collapsed tag indicator with dropdown
  // If item is provided, "Clear tag" option will be available to remove tags from the item
  private renderTagDropdown(tags: string[], container: HTMLElement, item?: TodoItem): void {
    if (tags.length === 0) return;

    // Get project colour map for tag colouring
    const projectColourMap = this.getProjectColourMap();

    const trigger = container.createEl("span", {
      cls: "tag-dropdown-trigger",
      text: "#",
    });

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();

      // Close any existing dropdown or popup
      this.closeDropdown();
      this.closeInfoPopup();

      // Create dropdown menu
      const dropdown = document.createElement("div");
      dropdown.className = "tag-dropdown-menu";

      // Determine sidebar position (left or right)
      const sidebarRoot = this.leaf.getRoot();
      const isRightSidebar = sidebarRoot === this.app.workspace.rightSplit;

      // Position dropdown below the trigger, adjusting for sidebar position
      const rect = trigger.getBoundingClientRect();
      dropdown.style.position = "fixed";
      dropdown.style.top = `${rect.bottom + 4}px`;

      if (isRightSidebar) {
        // Menu opens to the left when in right sidebar
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
        dropdown.classList.add("dropdown-left");
      } else {
        // Menu opens to the right when in left sidebar
        dropdown.style.left = `${rect.left}px`;
      }

      // Add tags to dropdown with submenus (sorted alphabetically)
      const sortedTags = [...tags].sort((a, b) => a.localeCompare(b));
      for (const tag of sortedTags) {
        const tagItem = dropdown.createEl("div", {
          cls: "tag-dropdown-item tag-dropdown-item-with-submenu",
        });

        // Get colour info for this tag
        const colourInfo = getTagColourInfo(tag, projectColourMap);

        const tagLabel = tagItem.createEl("span", {
          cls: "tag-dropdown-item-label tag",
          text: tag,
        });
        // Add semantic colour data attributes
        tagLabel.dataset.scTagType = colourInfo.type;
        tagLabel.dataset.scPriority = colourInfo.priority.toString();

        const arrow = tagItem.createEl("span", {
          cls: "tag-dropdown-item-arrow",
          text: "›",
        });

        // Create submenu
        const submenu = tagItem.createEl("div", {
          cls: "tag-dropdown-submenu",
        });

        // Clear tag option (only if item is provided) - alphabetically first
        if (item) {
          const clearTagOption = submenu.createEl("div", {
            cls: "tag-dropdown-submenu-item",
            text: "Clear tag",
          });
          clearTagOption.addEventListener("click", async (e) => {
            e.stopPropagation();
            this.closeDropdown();
            const success = await this.processor.removeTag(item, tag);
            if (success) {
              this.render();
            }
          });
        }

        // Filter by option
        const filterOption = submenu.createEl("div", {
          cls: "tag-dropdown-submenu-item",
          text: "Filter by",
        });
        filterOption.addEventListener("click", (e) => {
          e.stopPropagation();
          this.activeTagFilter = tag;
          this.closeDropdown();
          this.render();
        });
      }

      // Add separator
      dropdown.createEl("div", { cls: "tag-dropdown-separator" });

      // Add clear filter option
      const clearItem = dropdown.createEl("div", {
        cls: `tag-dropdown-clear${this.activeTagFilter ? "" : " disabled"}`,
        text: "Clear filter",
      });
      if (this.activeTagFilter) {
        clearItem.addEventListener("click", (e) => {
          e.stopPropagation();
          this.activeTagFilter = null;
          this.closeDropdown();
          this.render();
        });
      }

      // Add to document and track
      document.body.appendChild(dropdown);
      this.openDropdown = dropdown;

      // Close on click outside
      const closeHandler = (e: MouseEvent) => {
        if (!dropdown.contains(e.target as Node) && e.target !== trigger) {
          this.closeDropdown();
          document.removeEventListener("click", closeHandler);
        }
      };
      // Use setTimeout to avoid immediate trigger from current click
      setTimeout(() => document.addEventListener("click", closeHandler), 0);
    });
  }

  async onOpen(): Promise<void> {
    // Set up auto-refresh listener
    this.updateListener = () => this.render();
    this.scanner.on("todos-updated", this.updateListener);

    // Check if scanner has data; if not, wait for initial scan to complete
    // This handles the case where Obsidian restores the sidebar from layout
    // before the plugin's scanVault() has finished
    const hasTodos = this.scanner.getTodos().length > 0;
    const hasTodones = this.scanner.getTodones().length > 0;
    const hasIdeas = this.scanner.getIdeas().length > 0;
    const hasPrinciples = this.scanner.getPrinciples().length > 0;

    if (!hasTodos && !hasTodones && !hasIdeas && !hasPrinciples) {
      // No data yet - scanner may still be initializing
      // Trigger a scan and let the event listener handle the render
      await this.scanner.scanVault();
    } else {
      this.render();
    }
  }

  async onClose(): Promise<void> {
    // Remove event listener
    if (this.updateListener) {
      this.scanner.off("todos-updated", this.updateListener);
      this.updateListener = null;
    }
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("space-command-sidebar");

    // Header with buttons
    const headerDiv = container.createEl("div", { cls: "sidebar-header" });
    const titleEl = headerDiv.createEl("h4", { cls: "sidebar-title" });
    const logoEl = titleEl.createEl("span", { cls: "space-command-logo clickable-logo", text: "␣⌘" });
    logoEl.addEventListener("click", () => this.onShowAbout());
    titleEl.appendText(this.activeTab === 'todos' ? " TODOs" : " IDEAs");

    // Tab navigation
    const tabNav = headerDiv.createEl("div", { cls: "sidebar-tab-nav" });

    const todosTab = tabNav.createEl("button", {
      cls: `sidebar-tab-btn ${this.activeTab === 'todos' ? 'active' : ''}`,
      attr: { "aria-label": "TODOs" },
    });
    todosTab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5"/><path d="m9 11 3 3L22 4"/></svg>';
    todosTab.addEventListener("click", () => {
      this.activeTab = 'todos';
      this.render();
    });

    const ideasTab = tabNav.createEl("button", {
      cls: `sidebar-tab-btn ${this.activeTab === 'ideas' ? 'active' : ''}`,
      attr: { "aria-label": "Ideas" },
    });
    ideasTab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>';
    ideasTab.addEventListener("click", () => {
      this.activeTab = 'ideas';
      this.render();
    });

    // Hamburger menu button (kebab style - vertical dots)
    const menuBtn = headerDiv.createEl("button", {
      cls: "clickable-icon sidebar-menu-btn",
      attr: { "aria-label": "Menu" },
    });
    menuBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>';

    menuBtn.addEventListener("click", (evt) => {
      const menu = new Menu();

      // Embed Syntax submenu
      menu.addItem((item) => {
        item
          .setTitle("Embed Syntax")
          .setIcon("copy");

        const submenu = (item as any).setSubmenu();
        submenu.addItem((subItem: any) => {
          subItem
            .setTitle("IDEA code block")
            .setIcon("code")
            .onClick(() => {
              navigator.clipboard.writeText("```focus-ideas\n```");
              showNotice("Copied IDEA code block syntax");
            });
        });
        submenu.addItem((subItem: any) => {
          subItem
            .setTitle("IDEA inline")
            .setIcon("brackets")
            .onClick(() => {
              navigator.clipboard.writeText("{{focus-ideas}}");
              showNotice("Copied IDEA inline syntax");
            });
        });
        submenu.addItem((subItem: any) => {
          subItem
            .setTitle("TODO code block")
            .setIcon("code")
            .onClick(() => {
              navigator.clipboard.writeText("```focus-todos\n```");
              showNotice("Copied TODO code block syntax");
            });
        });
        submenu.addItem((subItem: any) => {
          subItem
            .setTitle("TODO inline")
            .setIcon("brackets")
            .onClick(() => {
              navigator.clipboard.writeText("{{focus-todos}}");
              showNotice("Copied TODO inline syntax");
            });
        });
      });

      // Refresh
      menu.addItem((item) => {
        item
          .setTitle("Refresh")
          .setIcon("refresh-cw")
          .onClick(async () => {
            menuBtn.addClass("rotating");
            await this.scanner.scanVault();
            setTimeout(() => menuBtn.removeClass("rotating"), 500);
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
          .onClick(() => {
            (this.app as any).setting.open();
            (this.app as any).setting.openTabById("space-command");
          });
      });

      // Stats
      menu.addItem((item) => {
        item
          .setTitle("Stats")
          .setIcon("bar-chart-2")
          .onClick(() => this.onShowStats());
      });

      menu.showAtMouseEvent(evt);
    });

    // Content wrapper for scrolling
    const content = container.createEl("div", { cls: "sidebar-content" });

    // Render content based on active tab
    if (this.activeTab === 'todos') {
      this.renderTodosContent(content);
    } else {
      this.renderIdeasContent(content);
    }
  }

  private renderTodosContent(container: HTMLElement): void {
    // Projects section
    this.renderProjects(container);

    // Active TODOs section
    this.renderActiveTodos(container);

    // Recent TODONEs section
    this.renderRecentTodones(container);
  }

  private renderIdeasContent(container: HTMLElement): void {
    // Principles section (grouped like projects)
    this.renderPrinciples(container);

    // Active Ideas section
    this.renderActiveIdeas(container);
  }

  private sortTodosByPriority(todos: TodoItem[]): TodoItem[] {
    return [...todos].sort(compareTodoItems);
  }

  /**
   * Render filter indicator button after section title if a filter is active.
   * Clicking the button clears the filter.
   */
  private renderFilterIndicator(header: HTMLElement): void {
    if (!this.activeTagFilter) return;

    const filterBtn = header.createEl("button", {
      cls: "filter-indicator-btn",
      attr: { "aria-label": `Clear filter: ${this.activeTagFilter}` },
    });
    filterBtn.createEl("span", { cls: "filter-indicator-tag", text: this.activeTagFilter });
    filterBtn.createEl("span", { cls: "filter-indicator-x", text: "×" });

    filterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.activeTagFilter = null;
      this.render();
    });
  }

  private renderProjects(container: HTMLElement): void {
    let projects = this.projectManager.getProjects();

    const section = container.createEl("div", { cls: "projects-section" });

    const header = section.createEl("div", {
      cls: "todo-section-header projects-header",
    });

    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "Focus";

    // Focus mode toggle button (eye icon)
    const focusModeBtn = header.createEl("button", {
      cls: `clickable-icon focus-mode-toggle-btn${this.focusModeEnabled ? ' active' : ''}`,
      attr: { "aria-label": this.focusModeEnabled ? "Show all projects" : "Show only focused" },
    });
    // Eye-off icon when focus mode is ON (filtering), eye icon when OFF (showing all)
    focusModeBtn.innerHTML = this.focusModeEnabled
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';

    focusModeBtn.addEventListener("click", () => {
      this.focusModeEnabled = !this.focusModeEnabled;
      showNotice(this.focusModeEnabled ? "Focus mode enabled" : "Focus mode disabled");
      this.render();
    });

    this.renderFilterIndicator(header);

    // Apply focus mode filter if enabled
    if (this.focusModeEnabled) {
      projects = projects.filter(p => p.highestPriority === 0);
    }

    if (projects.length === 0) {
      section.createEl("div", {
        text: this.focusModeEnabled ? "No focused projects" : "No focus projects yet",
        cls: "todo-empty",
      });
      return;
    }

    // Sort projects by: 1) has focus items, 2) priority, 3) tag count (higher = better)
    projects.sort((a, b) => {
      // Focus items first (priority 0 = #focus)
      const aHasFocus = a.highestPriority === 0;
      const bHasFocus = b.highestPriority === 0;
      if (aHasFocus && !bHasFocus) return -1;
      if (!aHasFocus && bHasFocus) return 1;

      // Then by priority
      const priorityDiff = a.highestPriority - b.highestPriority;
      if (priorityDiff !== 0) return priorityDiff;

      // Then by count (higher count = more tags/activity)
      return b.count - a.count;
    });

    // Track total count before limiting
    const totalCount = projects.length;

    // Apply limit
    if (this.focusListLimit > 0) {
      projects = projects.slice(0, this.focusListLimit);
    }

    const list = section.createEl("ul", { cls: "project-list" });

    for (const project of projects) {
      this.renderProjectItem(list, project);
    }

    // Show count indicator if there are more projects than displayed
    if (totalCount > projects.length) {
      const moreIndicator = section.createEl("div", {
        cls: "todo-more-indicator",
        text: `+${totalCount - projects.length} more`,
      });
      moreIndicator.setAttribute("title", `Showing ${projects.length} of ${totalCount} projects`);
    }
  }

  private renderProjectItem(list: HTMLElement, project: ProjectInfo): void {
    // Check if this project has any #focus items (priority 0 = #focus)
    const hasFocusItems = project.highestPriority === 0;
    const item = list.createEl("li", { cls: `project-item${hasFocusItems ? ' project-focus' : ''}` });

    // Add context menu for project operations
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.contextMenuHandler.showProjectMenu(
        e,
        project,
        this.scanner,
        () => this.render(),
        (tag) => {
          this.activeTagFilter = tag;
          this.render();
        }
      );
    });

    // Checkbox for completing all project TODOs
    const checkbox = item.createEl("input", {
      type: "checkbox",
      cls: "project-checkbox",
    });

    checkbox.addEventListener("change", async () => {
      checkbox.checked = false; // Uncheck immediately
      const confirmed = await this.confirmCompleteProject(project);
      if (confirmed) {
        await this.completeAllProjectTodos(project);
      }
    });

    // Project name (using safe DOM methods)
    const textSpan = item.createEl("span", { cls: "project-text" });
    textSpan.appendText(project.tag + " ");

    // Info icon for project details popup
    const infoIcon = item.createEl("span", {
      cls: "project-info-icon",
      text: "ⓘ",
      attr: { "aria-label": "Project info" },
    });

    infoIcon.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this.showProjectInfoPopup(project, infoIcon);
    });

    // Link to project file
    const link = item.createEl("a", {
      text: "→",
      cls: "project-link",
      href: "#",
    });

    link.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.projectManager.openProjectFile(project.tag);
    });
  }

  private async showProjectInfoPopup(project: ProjectInfo, trigger: HTMLElement): Promise<void> {
    // Close any existing popup or dropdown
    this.closeInfoPopup();
    this.closeDropdown();

    const info = await this.projectManager.getProjectFileInfo(project.tag);

    // Create popup container
    const popup = document.createElement("div");
    popup.className = "project-info-popup";
    // Set width inline to ensure CSS precedence
    popup.style.minWidth = "350px";
    popup.style.maxWidth = "450px";

    // Determine sidebar position (left or right)
    const sidebarRoot = this.leaf.getRoot();
    const isRightSidebar = sidebarRoot === this.app.workspace.rightSplit;

    // Position popup relative to trigger
    const rect = trigger.getBoundingClientRect();
    popup.style.position = "fixed";
    popup.style.top = `${rect.top}px`;

    if (isRightSidebar) {
      // Popup appears to the left of the sidebar
      popup.style.right = `${window.innerWidth - rect.left + 8}px`;
      popup.classList.add("popup-left");
    } else {
      // Popup appears to the right of the sidebar
      popup.style.left = `${rect.right + 8}px`;
      popup.classList.add("popup-right");
    }

    if (info) {
      // Project title
      const title = popup.createEl("div", { cls: "project-info-title" });
      title.appendText(project.tag);

      // Description (rendered as markdown to support callouts)
      if (info.description) {
        const desc = popup.createEl("div", { cls: "project-info-description" });
        const component = new Component();
        component.load();
        await MarkdownRenderer.render(this.app, info.description, desc, info.filepath, component);
      } else {
        const desc = popup.createEl("div", { cls: "project-info-description project-info-empty" });
        desc.appendText("No description available.");
      }

      // Principles section
      if (info.principles.length > 0) {
        popup.createEl("div", { cls: "project-info-separator" });
        const principlesHeader = popup.createEl("div", { cls: "project-info-section-header" });
        principlesHeader.appendText("Principles");

        const principlesList = popup.createEl("div", { cls: "project-info-principles" });
        for (const principle of info.principles) {
          const principleItem = principlesList.createEl("span", { cls: "project-info-principle-tag" });
          principleItem.appendText(principle);
        }
      }

      // Link to open file
      popup.createEl("div", { cls: "project-info-separator" });
      const linkContainer = popup.createEl("div", { cls: "project-info-link-container" });
      const openLink = linkContainer.createEl("a", {
        cls: "project-info-link",
        href: "#",
      });
      openLink.appendText("Open project file →");

      openLink.addEventListener("click", async (e) => {
        e.preventDefault();
        this.closeInfoPopup();
        // Open in new tab
        const filepath = this.projectManager.getProjectFilePath(project.tag);
        const file = this.app.vault.getAbstractFileByPath(filepath);
        if (file instanceof TFile) {
          const leaf = this.app.workspace.getLeaf("tab");
          await leaf.openFile(file);
        }
      });
    } else {
      // File doesn't exist yet
      const noFile = popup.createEl("div", { cls: "project-info-no-file" });
      noFile.appendText("Project file not found.");

      const createHint = popup.createEl("div", { cls: "project-info-hint" });
      createHint.appendText("Click → to create it.");
    }

    // Add to document and track
    document.body.appendChild(popup);
    this.openInfoPopup = popup;

    // Adjust vertical position if popup would go off screen
    const popupRect = popup.getBoundingClientRect();
    if (popupRect.bottom > window.innerHeight - 10) {
      const overflow = popupRect.bottom - window.innerHeight + 10;
      popup.style.top = `${rect.top - overflow}px`;
    }

    // Close on click outside
    const closeHandler = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node) && e.target !== trigger) {
        this.closeInfoPopup();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 0);
  }

  private closeInfoPopup(): void {
    if (this.openInfoPopup) {
      this.openInfoPopup.remove();
      this.openInfoPopup = null;
    }
  }

  private renderActiveTodos(container: HTMLElement): void {
    let todos = this.scanner.getTodos();

    // Filter out #future (snoozed) TODOs
    todos = todos.filter(todo => !todo.tags.includes("#future"));

    // Filter out #idea items (they should only appear in Ideas tab)
    todos = todos.filter(todo =>
      !todo.tags.includes("#idea") &&
      !todo.tags.includes("#ideas") &&
      !todo.tags.includes("#ideation")
    );

    // Filter out child items (they'll be rendered under their parent header)
    // Exception: In focus mode, keep children with #focus so they appear standalone
    if (this.focusModeEnabled) {
      todos = todos.filter(todo =>
        todo.parentLineNumber === undefined || todo.tags.includes("#focus")
      );
    } else {
      todos = todos.filter(todo => todo.parentLineNumber === undefined);
    }

    // Apply tag filter if active
    if (this.activeTagFilter) {
      todos = todos.filter(todo => todo.tags.includes(this.activeTagFilter!));
    }

    // Apply focus mode filter if enabled
    if (this.focusModeEnabled) {
      if (this.focusModeIncludeProjects) {
        // Get project tags from focused projects
        const focusedProjects = this.projectManager.getProjects()
          .filter(p => p.highestPriority === 0)
          .map(p => p.tag);
        // Show #focus items or items from focused projects
        todos = todos.filter(todo =>
          todo.tags.includes("#focus") ||
          todo.tags.some(tag => focusedProjects.includes(tag))
        );
      } else {
        // Show only #focus items
        todos = todos.filter(todo => todo.tags.includes("#focus"));
      }
    }

    // Sort by focus, priority, then tag count
    todos = this.sortTodosByPriority(todos);

    // Track total count before limiting
    const totalCount = todos.length;

    // Apply limit
    if (this.activeTodosLimit > 0) {
      todos = todos.slice(0, this.activeTodosLimit);
    }

    const section = container.createEl("div", { cls: "todo-section" });

    const header = section.createEl("div", { cls: "todo-section-header" });
    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "TODO";
    this.renderFilterIndicator(header);

    if (totalCount === 0) {
      let emptyText = "No TODOs";
      if (this.focusModeEnabled) {
        emptyText = "No focused TODOs";
      } else if (this.activeTagFilter) {
        emptyText = `No TODOs matching ${this.activeTagFilter}`;
      }
      section.createEl("div", {
        text: emptyText,
        cls: "todo-empty",
      });
      return;
    }

    const list = section.createEl("ul", { cls: "todo-list" });

    for (const todo of todos) {
      this.renderTodoItem(list, todo);
    }

    // Show count indicator if there are more items than displayed
    if (totalCount > todos.length) {
      const moreIndicator = section.createEl("div", {
        cls: "todo-more-indicator",
        text: `+${totalCount - todos.length} more`,
      });
      moreIndicator.setAttribute("title", `Showing ${todos.length} of ${totalCount} TODOs`);
    }
  }

  private renderTodoItem(list: HTMLElement, todo: TodoItem, isChild: boolean = false): void {
    this.renderListItem(list, todo, this.todoConfig, isChild);
  }

  private renderRecentTodones(container: HTMLElement): void {
    let allTodones = this.scanner.getTodones(100); // Get more than we need

    // Apply focus mode filtering if enabled
    if (this.focusModeEnabled) {
      // Filter by today's completion date
      const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
      allTodones = allTodones.filter(todone => {
        const completionDate = this.extractCompletionDate(todone.text);
        return completionDate === today;
      });

      // Apply focus/project filter (same logic as Active TODOs)
      if (this.focusModeIncludeProjects) {
        // Get project tags from focused projects
        const focusedProjects = this.projectManager.getProjects()
          .filter(p => p.highestPriority === 0)
          .map(p => p.tag);
        // Show #focus items or items from focused projects
        allTodones = allTodones.filter(todone =>
          todone.tags.includes("#focus") ||
          todone.tags.some(tag => focusedProjects.includes(tag))
        );
      } else {
        // Show only #focus items
        allTodones = allTodones.filter(todone => todone.tags.includes("#focus"));
      }
    }

    const todones = allTodones.slice(0, this.recentTodonesLimit); // Limit display

    const section = container.createEl("div", { cls: "todone-section" });

    const header = section.createEl("div", {
      cls: "todo-section-header todone-header",
    });

    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "DONE";
    // No filter indicator for DONE section

    // Add link to done file
    const fileLink = header.createEl("a", {
      text: this.defaultTodoneFile,
      cls: "done-file-link",
      href: "#",
    });
    fileLink.addEventListener("click", async (e) => {
      e.preventDefault();
      const file = this.app.vault.getAbstractFileByPath(this.defaultTodoneFile);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(file);
      }
    });

    if (allTodones.length === 0) {
      let emptyText = "No completed TODOs";
      if (this.focusModeEnabled) {
        emptyText = "No focused TODOs completed today";
      }
      section.createEl("div", {
        text: emptyText,
        cls: "todo-empty",
      });
      return;
    }

    const list = section.createEl("ul", { cls: "todo-list todone-list" });

    for (const todone of todones) {
      this.renderTodoneItem(list, todone);
    }
  }

  private renderTodoneItem(list: HTMLElement, todone: TodoItem): void {
    const item = list.createEl("li", { cls: "todo-item todone-item" });

    // Checked checkbox - interactive for uncompleting
    const checkbox = item.createEl("input", {
      type: "checkbox",
      cls: "todo-checkbox",
      attr: { checked: "checked" },
    });

    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      const success = await this.processor.uncompleteTodo(todone);
      if (!success) {
        checkbox.disabled = false;
        checkbox.checked = true; // Revert to checked state on failure
      }
      // Note: sidebar will auto-refresh via todos-updated event after scanner rescans
    });

    // Text content (strip markdown, tags, and date for display)
    const textSpan = item.createEl("span", { cls: "todo-text todone-text" });
    const cleanText = todone.text.replace(/#todones?\b/g, "").trim();
    const completionDate = this.extractCompletionDate(cleanText);
    const displayText = this.stripMarkdownSyntax(cleanText);
    // Strip all tags and date from display text (they'll be rendered separately)
    const textWithoutTags = displayText
      .replace(/#[\w-]+/g, "")
      .replace(/@\d{4}-\d{2}-\d{2}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    textSpan.appendText(textWithoutTags);
    textSpan.appendText(" ");

    // Get tags (excluding #todone) and render dropdown
    const tags = extractTags(cleanText);
    this.renderTagDropdown(tags, item, todone);

    // Add completion date with muted pill style
    if (completionDate) {
      item.createEl("span", {
        cls: "todo-date muted-pill",
        text: completionDate,
      });
    }

    // Link to source
    const link = item.createEl("a", {
      text: "→",
      cls: "todo-link",
      href: "#",
    });

    link.addEventListener("click", (e) => {
      e.preventDefault();
      openFileAtLine(this.app, todone.file, todone.lineNumber);
    });
  }

  private renderPrinciples(container: HTMLElement): void {
    let principles = this.scanner.getPrinciples();

    // Filter out child items (they'll be rendered under their parent header)
    principles = principles.filter(p => p.parentLineNumber === undefined);

    // Apply tag filter if active
    if (this.activeTagFilter) {
      principles = principles.filter(p => p.tags.includes(this.activeTagFilter!));
    }

    const section = container.createEl("div", { cls: "principles-section" });

    const header = section.createEl("div", {
      cls: "todo-section-header principles-header",
    });

    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "Principles";
    this.renderFilterIndicator(header);

    if (principles.length === 0) {
      section.createEl("div", {
        text: this.activeTagFilter ? `No principles matching ${this.activeTagFilter}` : "No principles yet",
        cls: "todo-empty",
      });
      return;
    }

    const list = section.createEl("ul", { cls: "principle-list" });

    for (const principle of principles) {
      this.renderPrincipleItem(list, principle);
    }
  }

  private renderPrincipleItem(list: HTMLElement, principle: TodoItem): void {
    this.renderListItem(list, principle, this.principleConfig);
  }

  private renderActiveIdeas(container: HTMLElement): void {
    let ideas = this.scanner.getIdeas();

    // Filter out #future (snoozed) ideas
    ideas = ideas.filter(idea => !idea.tags.includes("#future"));

    // Filter out child items (they'll be rendered under their parent header)
    ideas = ideas.filter(idea => idea.parentLineNumber === undefined);

    // Apply tag filter if active
    if (this.activeTagFilter) {
      ideas = ideas.filter(idea => idea.tags.includes(this.activeTagFilter!));
    }

    // Sort by priority (focus first)
    ideas = this.sortTodosByPriority(ideas);

    const section = container.createEl("div", { cls: "ideas-section" });

    const header = section.createEl("div", { cls: "todo-section-header" });
    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "Ideas";
    this.renderFilterIndicator(header);

    if (ideas.length === 0) {
      section.createEl("div", {
        text: this.activeTagFilter ? `No ideas matching ${this.activeTagFilter}` : "No ideas yet",
        cls: "todo-empty",
      });
      return;
    }

    const list = section.createEl("ul", { cls: "idea-list" });

    for (const idea of ideas) {
      this.renderIdeaItem(list, idea);
    }
  }

  private renderIdeaItem(list: HTMLElement, idea: TodoItem): void {
    this.renderListItem(list, idea, this.ideaConfig);
  }

  private async confirmCompleteProject(project: ProjectInfo): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText("Complete All Project TODOs?");
      modal.contentEl.createEl("p", {
        text: `This will mark all ${project.count} TODO(s) for project ${project.tag} as complete. This action cannot be undone.`,
      });

      const buttonContainer = modal.contentEl.createEl("div", {
        cls: "modal-button-container",
      });
      buttonContainer.style.display = "flex";
      buttonContainer.style.justifyContent = "flex-end";
      buttonContainer.style.gap = "8px";
      buttonContainer.style.marginTop = "16px";

      const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
      cancelBtn.addEventListener("click", () => {
        modal.close();
        resolve(false);
      });

      const confirmBtn = buttonContainer.createEl("button", {
        text: "Complete All",
        cls: "mod-cta",
      });
      confirmBtn.addEventListener("click", () => {
        modal.close();
        resolve(true);
      });

      modal.open();
    });
  }

  private async completeAllProjectTodos(project: ProjectInfo): Promise<void> {
    const todos = this.scanner.getTodos().filter((todo) =>
      todo.tags.includes(project.tag)
    );

    let completed = 0;
    let failed = 0;

    for (const todo of todos) {
      const success = await this.processor.completeTodo(
        todo,
        this.defaultTodoneFile
      );
      if (success) {
        completed++;
      } else {
        failed++;
      }
    }

    if (failed > 0) {
      showNotice(`Completed ${completed} TODO(s), ${failed} failed. See console for details.`);
    } else {
      showNotice(`Completed all ${completed} TODO(s) for ${project.tag}!`);
    }
    // Note: sidebar will auto-refresh via todos-updated event after scanner rescans
  }

}
