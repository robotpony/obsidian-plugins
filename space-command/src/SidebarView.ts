import { ItemView, WorkspaceLeaf, TFile, Menu, Modal, MarkdownRenderer, Component, moment } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { TodoProcessor } from "./TodoProcessor";
import { ProjectManager } from "./ProjectManager";
import { TeamManager } from "./TeamManager";
import { TodoItem, ProjectInfo, ItemRenderConfig, FocusQueueState } from "./types";
import { ContextMenuHandler } from "./ContextMenuHandler";
import { getPriorityValue, compareTodoItems, compareWithEffectivePriority, hasTag, openFileAtLine, extractTags, extractMentions, resolveMentions, resolveEffectiveMentions, showNotice, getTagColourInfo, extractCompletionDate, buildFocusQueue, getItemDate, rotateQueue } from "./utils";

export const VIEW_TYPE_TODO_SIDEBAR = "space-command-sidebar";

export class TodoSidebarView extends ItemView {
  private scanner: TodoScanner;
  private processor: TodoProcessor;
  private projectManager: ProjectManager;
  private defaultTodoneFile: string;
  private updateListener: (() => void) | null = null;
  private contextMenuHandler: ContextMenuHandler;
  private activeTodosLimit: number;
  // True while a Complete/Skip transition animation is in flight; suppresses
  // mid-animation re-renders that would otherwise tear the card off-screen.
  private animatingFocusTransition: boolean = false;
  // Class applied to the next mounted focus card so its entrance matches the
  // action that produced it (Complete fades up, Skip slides in from the right).
  private pendingFocusEnter: "complete" | "skip" | null = null;
  // Summary section starts collapsed every session; the user can expand it
  // for the current session but the default never sticks as expanded.
  private summaryExpanded: boolean = false;
  private focusListLimit: number;
  private makeLinksClickable: boolean;
  private triageSnoozedThreshold: number;
  private triageActiveThreshold: number;
  private activeTab: 'todos' | 'ideas' | 'snoozed' = 'todos';
  private activeTagFilter: string | null = null;
  private activeAssigneeFilter: string | null = null;
  private teamManager: TeamManager;
  private defaultAssignee: string;
  // Immersive focus mode state.
  private focusQueueLimit: number;
  private focusModeActive: boolean = false;
  private focusQueue: FocusQueueState | null = null;
  private setFocusModeActive: (active: boolean) => Promise<void>;
  // Snapshot for restoring sidebar position on Exit.
  private prevActiveTab: 'todos' | 'ideas' | 'snoozed' | null = null;
  private prevScrollTop: number = 0;
  private openDropdown: HTMLElement | null = null;
  private openDropdownTrigger: HTMLElement | null = null;
  private openInfoPopup: HTMLElement | null = null;
  private onShowAbout: () => void;
  private onShowStats: () => void;
  private onShowTriage: () => void;

  constructor(
    leaf: WorkspaceLeaf,
    scanner: TodoScanner,
    processor: TodoProcessor,
    projectManager: ProjectManager,
    defaultTodoneFile: string,
    priorityTags: string[],
    activeTodosLimit: number,
    focusListLimit: number,
    makeLinksClickable: boolean,
    triageSnoozedThreshold: number,
    triageActiveThreshold: number,
    onShowAbout: () => void,
    onShowStats: () => void,
    onShowTriage: () => void,
    getMoveHistory: () => string[] = () => [],
    teamManager?: TeamManager,
    defaultAssignee: string = "",
    focusQueueLimit: number = 1,
    focusModeActive: boolean = false,
    setFocusModeActive: (active: boolean) => Promise<void> = async () => {}
  ) {
    super(leaf);
    this.scanner = scanner;
    this.processor = processor;
    this.projectManager = projectManager;
    this.defaultTodoneFile = defaultTodoneFile;
    this.activeTodosLimit = activeTodosLimit;
    this.focusListLimit = focusListLimit;
    this.makeLinksClickable = makeLinksClickable;
    this.triageSnoozedThreshold = triageSnoozedThreshold;
    this.triageActiveThreshold = triageActiveThreshold;
    this.onShowAbout = onShowAbout;
    this.onShowStats = onShowStats;
    this.onShowTriage = onShowTriage;
    this.teamManager = teamManager ?? new TeamManager(this.app, "team.md");
    this.defaultAssignee = defaultAssignee;
    this.focusQueueLimit = focusQueueLimit;
    this.focusModeActive = focusModeActive;
    this.setFocusModeActive = setFocusModeActive;

    // Initialize context menu handler
    this.contextMenuHandler = new ContextMenuHandler(
      this.app,
      processor,
      priorityTags,
      getMoveHistory
    );
  }

  getViewType(): string {
    return VIEW_TYPE_TODO_SIDEBAR;
  }

  getDisplayText(): string {
    switch (this.activeTab) {
      case 'todos': return "TODOs";
      case 'ideas': return "IDEAs";
      case 'snoozed': return "Snoozed";
    }
  }

  getIcon(): string {
    return "square-check-big";
  }

  private shouldShowTriageAlert(): boolean {
    // Get active (non-snoozed) TODOs
    const allTodos = this.scanner.getTodos();
    const activeTodos = allTodos.filter(t =>
      !t.tags.includes("#future") &&
      !t.tags.includes("#snooze") &&
      !t.tags.includes("#snoozed") &&
      !t.tags.includes("#idea") &&
      !t.tags.includes("#ideas") &&
      !t.tags.includes("#ideation")
    );

    // Get active (non-snoozed) Ideas
    const allIdeas = this.scanner.getIdeas();
    const activeIdeas = allIdeas.filter(i =>
      !i.tags.includes("#future") &&
      !i.tags.includes("#snooze") &&
      !i.tags.includes("#snoozed")
    );

    // Get snoozed items (both TODOs and Ideas)
    const snoozedTodos = allTodos.filter(t =>
      t.tags.includes("#future") ||
      t.tags.includes("#snooze") ||
      t.tags.includes("#snoozed")
    );
    const snoozedIdeas = allIdeas.filter(i =>
      i.tags.includes("#future") ||
      i.tags.includes("#snooze") ||
      i.tags.includes("#snoozed")
    );
    const totalSnoozed = snoozedTodos.length + snoozedIdeas.length;

    // Show alert if either threshold is exceeded
    const activeCount = activeTodos.length + activeIdeas.length;
    return totalSnoozed > this.triageSnoozedThreshold || activeCount > this.triageActiveThreshold;
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
          if (url.startsWith('http://') || url.startsWith('https://')) {
            window.open(url, '_blank');
          }
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
    // Subheading labels: render as subtle section divider with mention badges
    if (isChild && item.isSubheading) {
      const subheadingItem = list.createEl("li", { cls: `${config.classPrefix}-item ${config.classPrefix}-child todo-subheading` });
      const cleanText = item.text
        .replace(/^\s*(\*\*|__)(.*?)(\*\*|__)\s*/, '$2 ')  // unwrap bold markers
        .replace(/#[\w-]+/g, '')          // strip tags
        .replace(/@[\w][\w.-]*/g, '')     // strip mentions (rendered as badges)
        .replace(/\s+/g, ' ').trim();
      subheadingItem.createEl("span", { cls: "todo-subheading-text", text: cleanText });
      if (item.mentions.length > 0) {
        this.renderMentionBadges(item.mentions, subheadingItem);
      }
      return;
    }

    const hasFocus = hasTag(item.tags, "#focus");
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

    // Checkbox (if configured). Header items with children no longer get a
    // checkbox — completing a header used to cascade-complete its children,
    // which was easy to do accidentally. Children are completed individually.
    if (config.showCheckbox && config.onComplete && !hasChildren) {
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

    // Show filename only (no folder) for header items with children — the folder
    // path was wrapping awkwardly in narrow sidebars and rarely told the user
    // anything they didn't already know.
    if (hasChildren) {
      rowContainer.createEl("span", {
        cls: "header-filename",
        text: item.file.name,
        attr: { title: item.file.path },
      });
    }

    // Mention badges (before tags so @handles appear first)
    if (item.mentions.length > 0) {
      this.renderMentionBadges(item.mentions, rowContainer);
    }

    // Get tags (excluding the type tag) and merge with parent header tags for child items
    const itemTags = extractTags(cleanText).filter(tag => !config.tagToStrip.test(tag));
    // Merge parent tags with item tags, avoiding duplicates
    const mergedTags = [...new Set([...parentTags, ...itemTags])];
    if (mergedTags.length > 0) {
      this.renderTagDropdown(mergedTags, rowContainer, item);
    }

    // Source affordance — varies by row type:
    //   - Children: nothing. The header row above already has its arrow.
    //   - Orphan items (no parent header): a clickable section label on the
    //     right (heading text or filename fallback). Doubles as the link to
    //     source, replacing the per-row arrow.
    //   - Headers (with or without children): keep the arrow.
    if (isChild) {
      // children render no inline link; the parent header's link gets you there
    } else if (isHeader) {
      const link = rowContainer.createEl("a", {
        text: "→",
        cls: `${config.classPrefix}-link`,
        href: "#",
      });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const blockEnd = item.childLineNumbers?.length
          ? Math.max(...item.childLineNumbers)
          : undefined;
        openFileAtLine(this.app, item.file, item.lineNumber, blockEnd);
      });
    } else {
      // Orphan item — surface its section context as the source link.
      const sectionText = item.sectionLabel?.trim() || item.file.name;
      const sectionLine = item.sectionLineNumber ?? item.lineNumber;
      const sectionLink = rowContainer.createEl("a", {
        cls: `${config.classPrefix}-section-link`,
        text: sectionText,
        href: "#",
        attr: { title: `Open ${item.file.path}` },
      });
      sectionLink.addEventListener("click", (e) => {
        e.preventDefault();
        openFileAtLine(this.app, item.file, sectionLine);
      });
    }

    // If this is a header with children, render children indented below
    if (hasChildren) {
      const childrenContainer = listItem.createEl("ul", { cls: `${config.classPrefix}-children` });
      const allItems = this.getItemsForType(config.type);
      const headerTags = extractTags(item.text).filter(tag => !config.tagToStrip.test(tag));
      const lines = item.childLineNumbers!;
      // Resolve child items once for peek-ahead
      const childItems = lines.map(ln => allItems.find(t => t.filePath === item.filePath && t.lineNumber === ln) ?? null);
      for (let idx = 0; idx < lines.length; idx++) {
        const childItem = childItems[idx];
        if (!childItem) continue;
        // Skip subheadings with no task items before the next subheading/end
        if (childItem.isSubheading) {
          let hasTasks = false;
          for (let k = idx + 1; k < childItems.length; k++) {
            const next = childItems[k];
            if (!next) continue;
            if (next.isSubheading) break;
            hasTasks = true;
            break;
          }
          if (!hasTasks) continue;
        }
        this.renderListItem(childrenContainer, childItem, config, true, headerTags);
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
      this.openDropdownTrigger = null;
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

      // If clicking the same trigger that opened the current dropdown, just close it (toggle)
      if (this.openDropdownTrigger === trigger) {
        this.closeDropdown();
        return;
      }

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

      // Add snooze/unsnooze option (only if item is provided)
      if (item) {
        const isSnoozed = item.tags.includes("#future") ||
                          item.tags.includes("#snooze") ||
                          item.tags.includes("#snoozed");
        const snoozeItem = dropdown.createEl("div", {
          cls: "tag-dropdown-item tag-dropdown-snooze",
          text: isSnoozed ? "Unsnooze this" : "Snooze this",
        });
        snoozeItem.addEventListener("click", async (e) => {
          e.stopPropagation();
          this.closeDropdown();
          let success: boolean;
          if (isSnoozed) {
            // Remove all snooze tags
            success = await this.processor.removeTag(item, "#future");
            if (item.tags.includes("#snooze")) {
              await this.processor.removeTag(item, "#snooze");
            }
            if (item.tags.includes("#snoozed")) {
              await this.processor.removeTag(item, "#snoozed");
            }
          } else {
            success = await this.processor.setPriorityTag(item, "#future");
          }
          if (success) {
            this.render();
          }
        });

        // Add another separator before clear filter
        dropdown.createEl("div", { cls: "tag-dropdown-separator" });
      }

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
      this.openDropdownTrigger = trigger;

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
    // Set up auto-refresh listener. When the underlying TODO data changes, drop
    // any cached focus queue so it's rebuilt fresh on the next render.
    this.updateListener = () => {
      this.focusQueue = null;
      // Skip the auto-rerender while a focus-card animation is playing —
      // handleFocusDone will trigger the render itself once the animation ends.
      if (this.animatingFocusTransition) return;
      this.render();
    };
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

    // Phase 2: when immersive Focus Mode is active, replace the entire sidebar
    // content with the focus card. Tabs, summary, and project list are not
    // rendered. Exit returns to normal rendering.
    if (this.focusModeActive) {
      container.addClass("sidebar-focus-mode-active");
      this.renderFocusCard(container);
      return;
    }
    container.removeClass("sidebar-focus-mode-active");

    // Header with buttons
    const headerDiv = container.createEl("div", { cls: "sidebar-header" });
    const titleEl = headerDiv.createEl("h4", { cls: "sidebar-title" });
    const logoEl = titleEl.createEl("span", { cls: "space-command-logo clickable-logo", text: "␣⌘" });
    logoEl.addEventListener("click", () => this.onShowAbout());
    switch (this.activeTab) {
      case 'todos': titleEl.appendText(" TODOs"); break;
      case 'ideas': titleEl.appendText(" IDEAs"); break;
      case 'snoozed': titleEl.appendText(" Snoozed"); break;
    }

    // Tab navigation
    const tabNav = headerDiv.createEl("div", { cls: "sidebar-tab-nav" });

    // Triage alert button (shown when thresholds exceeded)
    if (this.shouldShowTriageAlert()) {
      const triageBtn = tabNav.createEl("button", {
        cls: "sidebar-tab-btn triage-alert-btn",
        attr: { "aria-label": "Triage needed" },
      });
      // Emergency siren/light icon
      triageBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="m5.5 5.5 3 3"/><path d="M2 12h4"/><path d="m5.5 18.5 3-3"/><path d="M12 22v-4"/><path d="m18.5 18.5-3-3"/><path d="M22 12h-4"/><path d="m18.5 5.5-3 3"/><circle cx="12" cy="12" r="4"/></svg>';
      triageBtn.addEventListener("click", () => this.onShowTriage());
    }

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

    const snoozedTab = tabNav.createEl("button", {
      cls: `sidebar-tab-btn ${this.activeTab === 'snoozed' ? 'active' : ''}`,
      attr: { "aria-label": "Snoozed" },
    });
    // Clock icon for snoozed
    snoozedTab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
    snoozedTab.addEventListener("click", () => {
      this.activeTab = 'snoozed';
      this.render();
    });

    // Hamburger menu button (kebab style - vertical dots)
    this.createSidebarMenuButton(headerDiv);

    // Content wrapper for scrolling
    const content = container.createEl("div", { cls: "sidebar-content" });

    // Render content based on active tab
    switch (this.activeTab) {
      case 'todos':
        this.renderTodosContent(content);
        break;
      case 'ideas':
        this.renderIdeasContent(content);
        break;
      case 'snoozed':
        this.renderSnoozedContent(content);
        break;
    }
  }

  private renderTodosContent(container: HTMLElement): void {
    // Projects section
    this.renderProjects(container);

    // Active TODOs section
    this.renderActiveTodos(container);

    // Summary section (priority counts, completion velocity, backlogs)
    this.renderSummary(container);
  }

  private renderIdeasContent(container: HTMLElement): void {
    // Ideas tab header with focus mode toggle
    this.renderIdeasHeader(container);

    // Principles section (grouped like projects)
    this.renderPrinciples(container);

    // Active Ideas section
    this.renderActiveIdeas(container);
  }

  private renderIdeasHeader(container: HTMLElement): void {
    const header = container.createEl("div", {
      cls: "todo-section-header ideas-tab-header",
    });

    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "Focus";

    this.renderFilterIndicator(header);
  }

  private renderSnoozedContent(container: HTMLElement): void {
    // Snoozed TODOs section
    this.renderSnoozedTodos(container);

    // Snoozed Ideas section
    this.renderSnoozedIdeas(container);
  }

  private renderSnoozedTodos(container: HTMLElement): void {
    let todos = this.scanner.getTodos();

    // Keep only snoozed items (#future, #snooze, #snoozed)
    todos = todos.filter(todo =>
      todo.tags.includes("#future") ||
      todo.tags.includes("#snooze") ||
      todo.tags.includes("#snoozed")
    );

    // Filter out #idea items
    todos = todos.filter(todo =>
      !todo.tags.includes("#idea") &&
      !todo.tags.includes("#ideas") &&
      !todo.tags.includes("#ideation")
    );

    // Filter out child items (they'll be rendered under their parent header)
    todos = todos.filter(todo => todo.parentLineNumber === undefined);

    // Apply tag filter if active
    if (this.activeTagFilter) {
      todos = todos.filter(todo => todo.tags.includes(this.activeTagFilter!));
    }

    // Sort by priority
    todos = this.sortTodosByPriority(todos);

    const section = container.createEl("div", { cls: "snoozed-todos-section" });

    const header = section.createEl("div", {
      cls: "todo-section-header snoozed-todos-header",
    });

    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "Snoozed TODOs";
    this.renderFilterIndicator(header);

    if (todos.length === 0) {
      section.createEl("div", {
        text: this.activeTagFilter ? `No snoozed TODOs matching ${this.activeTagFilter}` : "No snoozed TODOs",
        cls: "todo-empty",
      });
      return;
    }

    const list = section.createEl("ul", { cls: "todo-list" });

    for (const todo of todos) {
      this.renderListItem(list, todo, this.todoConfig);
    }
  }

  private renderSnoozedIdeas(container: HTMLElement): void {
    let ideas = this.scanner.getIdeas();

    // Keep only snoozed items (#future, #snooze, #snoozed)
    ideas = ideas.filter(idea =>
      idea.tags.includes("#future") ||
      idea.tags.includes("#snooze") ||
      idea.tags.includes("#snoozed")
    );

    // Filter out child items
    ideas = ideas.filter(idea => idea.parentLineNumber === undefined);

    // Apply tag filter if active
    if (this.activeTagFilter) {
      ideas = ideas.filter(idea => idea.tags.includes(this.activeTagFilter!));
    }

    // Sort by priority
    ideas = this.sortTodosByPriority(ideas);

    const section = container.createEl("div", { cls: "snoozed-ideas-section" });

    const header = section.createEl("div", {
      cls: "todo-section-header snoozed-ideas-header",
    });

    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "Snoozed Ideas";
    this.renderFilterIndicator(header);

    if (ideas.length === 0) {
      section.createEl("div", {
        text: this.activeTagFilter ? `No snoozed ideas matching ${this.activeTagFilter}` : "No snoozed ideas",
        cls: "todo-empty",
      });
      return;
    }

    const list = section.createEl("ul", { cls: "idea-list" });

    for (const idea of ideas) {
      this.renderListItem(list, idea, this.ideaConfig);
    }
  }

  private sortTodosByPriority(todos: TodoItem[], allTodosForChildLookup?: TodoItem[]): TodoItem[] {
    const lookupList = allTodosForChildLookup || todos;
    const meHandle = this.teamManager.resolveMe();
    return [...todos].sort((a, b) => {
      const base = compareWithEffectivePriority(a, b, lookupList);
      if (base !== 0) return base;
      // Soft @me boost: within the same priority tier, @me items sort first
      if (meHandle) {
        const aIsMe = resolveMentions(a, meHandle).includes(meHandle);
        const bIsMe = resolveMentions(b, meHandle).includes(meHandle);
        if (aIsMe && !bIsMe) return -1;
        if (!aIsMe && bIsMe) return 1;
      }
      return 0;
    });
  }

  /**
   * Render filter indicator button after section title if a filter is active.
   * Clicking the button clears the filter.
   */
  private renderMentionBadges(mentions: string[], container: HTMLElement): void {
    const meHandle = this.teamManager.resolveMe();
    for (const mention of mentions) {
      const isMe = mention === "me" || (meHandle && mention === meHandle);
      const badge = container.createEl("span", {
        cls: `sc-mention sc-mention-clickable${isMe ? " sc-mention-me" : ""}`,
        text: `@${mention}`,
      });
      const member = this.teamManager.resolveHandle(mention);
      if (member) {
        badge.setAttribute("title", `Filter by ${member.name}`);
      }
      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.activeAssigneeFilter = isMe ? "me" : mention;
        this.render();
      });
    }
  }

  private renderAssigneeFilter(header: HTMLElement): void {
    const team = this.teamManager.getTeam();
    // Only show filter if there are team members defined
    if (team.length === 0) return;

    const label = this.activeAssigneeFilter
      ? (this.activeAssigneeFilter === "__unassigned__" ? "?" : `@${this.activeAssigneeFilter}`)
      : "@";

    const trigger = header.createEl("span", {
      cls: `sc-assignee-filter${this.activeAssigneeFilter ? " active" : ""}`,
      text: label,
      attr: { "aria-label": "Filter by assignee" },
    });

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeDropdown();

      const dropdown = document.createElement("div");
      dropdown.className = "tag-dropdown-menu";

      const rect = trigger.getBoundingClientRect();
      dropdown.style.position = "fixed";
      dropdown.style.top = `${rect.bottom + 4}px`;

      const sidebarRoot = this.leaf.getRoot();
      const isRightSidebar = sidebarRoot === this.app.workspace.rightSplit;
      if (isRightSidebar) {
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
        dropdown.classList.add("dropdown-left");
      } else {
        dropdown.style.left = `${rect.left}px`;
      }

      // "Everyone" option
      const everyoneItem = dropdown.createEl("div", { cls: "tag-dropdown-item" });
      everyoneItem.createEl("span", { cls: "tag-dropdown-item-label", text: "Everyone" });
      everyoneItem.addEventListener("click", () => {
        this.activeAssigneeFilter = null;
        this.closeDropdown();
        this.render();
      });

      // Team members
      const meHandle = this.teamManager.resolveMe();
      if (meHandle) {
        const meItem = dropdown.createEl("div", { cls: "tag-dropdown-item" });
        const meMember = team.find(m => m.isMe);
        meItem.createEl("span", { cls: "tag-dropdown-item-label sc-mention sc-mention-me", text: `@me` });
        if (meMember) meItem.createEl("span", { cls: "sc-assignee-filter-name", text: meMember.name });
        meItem.addEventListener("click", () => {
          this.activeAssigneeFilter = "me";
          this.closeDropdown();
          this.render();
        });
      }

      for (const member of team) {
        if (member.isMe) continue;
        const item = dropdown.createEl("div", { cls: "tag-dropdown-item" });
        item.createEl("span", { cls: "tag-dropdown-item-label sc-mention", text: `@${member.handle}` });
        item.createEl("span", { cls: "sc-assignee-filter-name", text: member.name });
        item.addEventListener("click", () => {
          this.activeAssigneeFilter = member.handle;
          this.closeDropdown();
          this.render();
        });
      }

      // Add handles found in TODOs but not in team.md
      const teamHandles = new Set(team.map(m => m.handle));
      if (meHandle) teamHandles.add("me");
      const allMentions = new Set<string>();
      for (const todo of this.scanner.getTodos()) {
        for (const m of todo.mentions) allMentions.add(m);
      }
      for (const handle of [...allMentions].sort()) {
        if (handle === "me" || teamHandles.has(handle)) continue;
        const item = dropdown.createEl("div", { cls: "tag-dropdown-item" });
        item.createEl("span", { cls: "tag-dropdown-item-label sc-mention", text: `@${handle}` });
        item.addEventListener("click", () => {
          this.activeAssigneeFilter = handle;
          this.closeDropdown();
          this.render();
        });
      }

      // Unassigned option
      const unassignedItem = dropdown.createEl("div", { cls: "tag-dropdown-item" });
      unassignedItem.createEl("span", { cls: "tag-dropdown-item-label", text: "Unassigned" });
      unassignedItem.addEventListener("click", () => {
        this.activeAssigneeFilter = "__unassigned__";
        this.closeDropdown();
        this.render();
      });

      document.body.appendChild(dropdown);
      this.openDropdown = dropdown;
      this.openDropdownTrigger = trigger;

      // Close on click outside
      const closeHandler = (e: MouseEvent) => {
        if (!dropdown.contains(e.target as Node) && e.target !== trigger) {
          this.closeDropdown();
          document.removeEventListener("click", closeHandler);
        }
      };
      setTimeout(() => document.addEventListener("click", closeHandler), 0);
    });
  }

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

    // Eye icon — single click enters immersive Focus Mode. The icon is only
    // ever visible in normal mode (Focus Mode hides the entire sidebar chrome),
    // so there is no toggle/active state to render.
    const focusModeBtn = header.createEl("button", {
      cls: "clickable-icon focus-mode-toggle-btn",
      attr: { "aria-label": "Enter focus mode" },
    });
    focusModeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    focusModeBtn.addEventListener("click", () => this.handleFocusEnter());

    this.renderFilterIndicator(header);

    if (projects.length === 0) {
      section.createEl("div", {
        text: "No focus projects yet",
        cls: "todo-empty",
      });
      return;
    }

    // Sort projects by: 1) focus tier (projects with focus items first), 2) priority, 3) count
    projects.sort((a, b) => {
      if (a.hasFocusItems && !b.hasFocusItems) return -1;
      if (!a.hasFocusItems && b.hasFocusItems) return 1;

      const priorityDiff = a.highestPriority - b.highestPriority;
      if (priorityDiff !== 0) return priorityDiff;

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
    // Check if this project has any #focus items
    const isActiveFilter = this.activeTagFilter === project.tag;
    const item = list.createEl("li", {
      cls: `project-item${project.hasFocusItems ? ' project-focus' : ''}${isActiveFilter ? ' project-item-active' : ''}`,
      attr: { role: "button", tabindex: "0", "aria-pressed": isActiveFilter ? "true" : "false" },
    });

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

    // Clicking the row toggles the tag filter on the active TODO list below.
    // The info icon and the open-file link stop propagation so they keep their
    // own behaviour.
    const toggleFilter = () => {
      this.activeTagFilter = isActiveFilter ? null : project.tag;
      this.render();
    };
    item.addEventListener("click", toggleFilter);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleFilter();
      }
    });

    // Project name (using safe DOM methods)
    const textSpan = item.createEl("span", { cls: "project-text" });
    textSpan.appendText(project.tag);

    // The info icon and the open-file arrow were removed in 0.15.2 — the row
    // is now a pure filter toggle. Right-click still opens the project menu
    // with both actions available.
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

      // Principle items - vault-wide items tagged with both #principle and this project's tag
      const projectPrinciples = this.scanner.getPrinciples().filter(p =>
        p.tags.includes(project.tag) || p.inferredFileTag === project.tag
      );

      if (projectPrinciples.length > 0) {
        popup.createEl("div", { cls: "project-info-separator" });
        const principlesHeader = popup.createEl("div", { cls: "project-info-section-header" });
        principlesHeader.appendText("Principles");

        const principlesList = popup.createEl("ul", { cls: "project-info-principle-items" });
        for (const principle of projectPrinciples) {
          const li = principlesList.createEl("li", { cls: "project-info-principle-item" });
          // Strip #principle tag and project tag from display text
          let displayText = principle.text
            .replace(/#principles?\b/gi, "")
            .replace(new RegExp(project.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\b", "gi"), "")
            .replace(/\s+/g, " ")
            .trim();
          // Remove leading list markers (-, *, +) if present
          displayText = displayText.replace(/^[-*+]\s*/, "");
          // Render as markdown for styling (bold, italic, links, etc.)
          const principleComponent = new Component();
          principleComponent.load();
          await MarkdownRenderer.render(this.app, displayText, li, info?.filepath || "", principleComponent);
        }
      }

      // Principle tags section (from project file)
      if (info.principles.length > 0) {
        popup.createEl("div", { cls: "project-info-separator" });
        const tagsHeader = popup.createEl("div", { cls: "project-info-section-header" });
        tagsHeader.appendText("Tags");

        const tagsList = popup.createEl("div", { cls: "project-info-principles" });
        for (const principle of info.principles) {
          const tagItem = tagsList.createEl("span", { cls: "project-info-principle-tag" });
          tagItem.appendText(principle);
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

    // Filter out snoozed TODOs (#future, #snooze, #snoozed)
    todos = todos.filter(todo =>
      !todo.tags.includes("#future") &&
      !todo.tags.includes("#snooze") &&
      !todo.tags.includes("#snoozed")
    );

    // Filter out #idea items (they should only appear in Ideas tab)
    todos = todos.filter(todo =>
      !todo.tags.includes("#idea") &&
      !todo.tags.includes("#ideas") &&
      !todo.tags.includes("#ideation")
    );

    // Filter out child items (they'll be rendered under their parent header).
    todos = todos.filter(todo => todo.parentLineNumber === undefined);

    // Filter out header TODOs where all children are complete, snoozed, or non-existent
    // This prevents users from having to mark headers done redundantly
    // Also handles case where child lines are empty/filtered out by scanner
    const allTodones = this.scanner.getTodones();
    const allTodosForChildLookup = this.scanner.getTodos();
    todos = todos.filter(todo => {
      if (!todo.isHeader) {
        return true; // Not a header, keep it
      }
      if (!todo.childLineNumbers) {
        return true; // Header without childLineNumbers array (standalone), keep it
      }
      if (todo.childLineNumbers.length === 0) {
        return false; // Header with empty children array - all children were empty/skipped, filter out
      }
      // Check if there are any active children (not complete, not snoozed, and exists)
      const hasActiveChild = todo.childLineNumbers.some(childLine => {
        // Check if child is complete
        const isComplete = allTodones.some(t => t.filePath === todo.filePath && t.lineNumber === childLine);
        if (isComplete) return false;
        // Check if child exists in todos
        const childItem = allTodosForChildLookup.find(t => t.filePath === todo.filePath && t.lineNumber === childLine);
        if (!childItem) {
          return false;
        }
        // Subheading labels are not tasks — skip them
        if (childItem.isSubheading) {
          return false;
        }
        // Check if child is snoozed
        const isSnoozed = childItem.tags.includes("#future") ||
                          childItem.tags.includes("#snooze") ||
                          childItem.tags.includes("#snoozed");
        if (isSnoozed) return false;
        return true; // Child is active
      });
      return hasActiveChild; // Keep header only if it has at least one active child
    });

    // Apply tag filter if active
    if (this.activeTagFilter) {
      todos = todos.filter(todo => todo.tags.includes(this.activeTagFilter!));
    }

    // Apply assignee filter if active
    if (this.activeAssigneeFilter) {
      const meHandle = this.teamManager.resolveMe();
      const da = this.defaultAssignee;
      const allTodosForMentionLookup = this.scanner.getTodos();
      if (this.activeAssigneeFilter === "__unassigned__") {
        todos = todos.filter(todo => {
          const effective = resolveEffectiveMentions(todo, meHandle, da);
          if (effective.length === 0) {
            if (todo.isHeader && todo.childLineNumbers?.length) {
              return todo.childLineNumbers.some(childLine => {
                const child = allTodosForMentionLookup.find(t => t.filePath === todo.filePath && t.lineNumber === childLine);
                return !child || resolveEffectiveMentions(child, meHandle, da).length === 0;
              });
            }
            return true;
          }
          return false;
        });
      } else {
        const filterHandle = this.activeAssigneeFilter === "me" && meHandle ? meHandle : this.activeAssigneeFilter;
        todos = todos.filter(todo => {
          const resolved = resolveEffectiveMentions(todo, meHandle, da);
          if (resolved.includes(filterHandle)) return true;
          // Keep headers if any child matches the filter
          if (todo.isHeader && todo.childLineNumbers?.length) {
            return todo.childLineNumbers.some(childLine => {
              const child = allTodosForMentionLookup.find(t => t.filePath === todo.filePath && t.lineNumber === childLine);
              if (!child) return false;
              return resolveEffectiveMentions(child, meHandle, da).includes(filterHandle);
            });
          }
          return false;
        });
      }
    }

    // Sort by focus, priority, then tag count
    // Pass the full todos list for accurate child priority lookup
    todos = this.sortTodosByPriority(todos, allTodosForChildLookup);

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
    this.renderAssigneeFilter(header);
    this.renderFilterIndicator(header);

    if (totalCount === 0) {
      const emptyText = this.activeTagFilter
        ? `No TODOs matching ${this.activeTagFilter}`
        : "No TODOs";
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

  private renderSummary(container: HTMLElement): void {
    const section = container.createEl("div", { cls: "summary-section" });
    this.renderSummaryHeader(section);
    if (!this.summaryExpanded) return;
    this.renderPriorityCounts(section);
    this.renderAssigneeStats(section);
    this.renderTopBacklogs(section);
  }

  private renderSummaryHeader(section: HTMLElement): void {
    const expanded = this.summaryExpanded;
    const header = section.createEl("div", {
      cls: `todo-section-header todone-header summary-header${expanded ? " summary-header-expanded" : ""}`,
      attr: { role: "button", tabindex: "0", "aria-expanded": expanded ? "true" : "false" },
    });

    // Chevron + title — chevron rotates on expand to signal state.
    const chevron = header.createEl("span", {
      cls: "summary-chevron",
      text: "▸",
      attr: { "aria-hidden": "true" },
    });
    void chevron;

    const titleSpan = header.createEl("span", { cls: "todo-section-title summary-title" });
    titleSpan.textContent = "SUMMARY";

    // Inline preview: total open count + Done velocity. Visible in both states
    // so the most useful at-a-glance number stays close to the title even when
    // the section is expanded.
    const preview = header.createEl("span", { cls: "summary-preview" });
    this.renderSummaryPreview(preview);

    // Right-side arrow opens the done file. Stops propagation so it doesn't
    // also toggle the section.
    const fileLink = header.createEl("a", {
      cls: "summary-done-link",
      text: "→",
      href: "#",
      attr: { "aria-label": `Open ${this.defaultTodoneFile}`, title: this.defaultTodoneFile },
    });
    fileLink.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const file = this.app.vault.getAbstractFileByPath(this.defaultTodoneFile);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(file);
      }
    });

    // Toggle expand/collapse on header click and on Enter / Space when focused.
    const toggle = () => {
      this.summaryExpanded = !this.summaryExpanded;
      this.render();
    };
    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  }

  private renderSummaryPreview(parent: HTMLElement): void {
    const todos = this.scanner.getTodos();
    const openCount = todos.filter(t => t.parentLineNumber === undefined).length;

    // Compute Done velocity inline so the collapsed header is self-contained.
    const todones = this.scanner.getTodones();
    const m = (moment as any);
    const todayStr = m().format("YYYY-MM-DD");
    const weekStart = m().startOf("isoWeek").format("YYYY-MM-DD");
    const monthStart = m().startOf("month").format("YYYY-MM-DD");
    let doneToday = 0, doneWeek = 0, doneMonth = 0;
    for (const t of todones) {
      const date = extractCompletionDate(t.text);
      if (!date) continue;
      if (date >= monthStart) {
        doneMonth++;
        if (date >= weekStart) {
          doneWeek++;
          if (date === todayStr) doneToday++;
        }
      }
    }

    parent.createEl("span", { cls: "summary-preview-num", text: String(openCount) });
    parent.createEl("span", { cls: "summary-preview-label", text: " open · Done: " });
    parent.createEl("span", { cls: "summary-preview-num", text: String(doneToday) });
    parent.createEl("span", { cls: "summary-preview-label", text: " today · " });
    parent.createEl("span", { cls: "summary-preview-num", text: String(doneWeek) });
    parent.createEl("span", { cls: "summary-preview-label", text: " week · " });
    parent.createEl("span", { cls: "summary-preview-num", text: String(doneMonth) });
    parent.createEl("span", { cls: "summary-preview-label", text: " month" });
  }

  private renderPriorityCounts(section: HTMLElement): void {
    const todos = this.scanner.getTodos();

    let today = 0, p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0;
    let focus = 0, snoozed = 0, none = 0;

    for (const t of todos) {
      if (hasTag(t.tags, "#today")) { today++; }
      else if (hasTag(t.tags, "#p0")) { p0++; }
      else if (hasTag(t.tags, "#p1")) { p1++; }
      else if (hasTag(t.tags, "#p2")) { p2++; }
      else if (hasTag(t.tags, "#p3")) { p3++; }
      else if (hasTag(t.tags, "#p4")) { p4++; }
      else if (hasTag(t.tags, "#future") || hasTag(t.tags, "#snooze") || hasTag(t.tags, "#snoozed")) { snoozed++; }
      else { none++; }
      // Count #focus separately (it's a tier, not mutually exclusive with priority)
      if (hasTag(t.tags, "#focus")) { focus++; }
    }

    const grid = section.createEl("div", { cls: "summary-counts-grid" });
    const pairs: [string, number, string, number][] = [
      ["#today", today, "#p0", p0],
      ["#p1", p1, "#p2", p2],
      ["#p3", p3, "#p4", p4],
      ["#focus", focus, "none", none],
      ["snoozed", snoozed, "total", todos.length],
    ];
    for (const [labelA, valA, labelB, valB] of pairs) {
      const row = grid.createEl("div", { cls: "summary-count-row" });
      this.renderCountCell(row, labelA, valA);
      this.renderCountCell(row, labelB, valB);
    }
  }

  private renderCountCell(row: HTMLElement, label: string, value: number): void {
    const cell = row.createEl("div", { cls: "summary-count-cell" });
    cell.createEl("span", { cls: "summary-count-label", text: label });
    const valEl = cell.createEl("span", { cls: "summary-count-value", text: String(value) });
    if (value === 0) valEl.addClass("zero");
  }

  private renderAssigneeStats(section: HTMLElement): void {
    const todos = this.scanner.getTodos();
    const meHandle = this.teamManager.resolveMe();

    const counts = new Map<string, number>();
    let unassigned = 0;
    let hasMentions = false;

    for (const t of todos) {
      if (t.mentions.length === 0) {
        unassigned++;
        continue;
      }
      hasMentions = true;
      const resolved = resolveMentions(t, meHandle);
      for (const handle of resolved) {
        counts.set(handle, (counts.get(handle) || 0) + 1);
      }
    }

    if (!hasMentions) return;

    const row = section.createEl("div", { cls: "sc-assignee-stats" });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [handle, count] of sorted) {
      const cell = row.createEl("span", { cls: "sc-assignee-stat" });
      cell.createEl("span", { cls: "sc-mention", text: `@${handle}` });
      cell.createEl("span", { cls: "summary-count-value", text: String(count) });
    }
    if (unassigned > 0) {
      const cell = row.createEl("span", { cls: "sc-assignee-stat" });
      cell.createEl("span", { text: "none" });
      cell.createEl("span", { cls: "summary-count-value", text: String(unassigned) });
    }
  }


  private renderTopBacklogs(section: HTMLElement): void {
    const projects = this.projectManager.getProjects();
    const qualifying = projects.filter(p => p.count >= 3);
    if (qualifying.length === 0) return;

    qualifying.sort((a, b) => b.count - a.count);
    const top = qualifying.slice(0, 5);

    // Compute median for warning threshold
    const allCounts = projects.map(p => p.count).sort((a, b) => a - b);
    const mid = Math.floor(allCounts.length / 2);
    const median = allCounts.length % 2 === 0
      ? (allCounts[mid - 1] + allCounts[mid]) / 2
      : allCounts[mid];
    const warnThreshold = median * 2;

    // Section label
    const label = section.createEl("div", { cls: "summary-backlogs-label" });
    label.createEl("span", { text: "Top backlogs" });

    for (const p of top) {
      const row = section.createEl("div", { cls: "summary-backlog-row" });
      row.createEl("span", { cls: "summary-count-label", text: p.tag });
      const valEl = row.createEl("span", {
        cls: "summary-count-value",
        text: String(p.count),
      });
      if (p.count > warnThreshold) {
        valEl.addClass("summary-backlog-warn");
      }
    }
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
      const emptyText = this.activeTagFilter
        ? `No principles matching ${this.activeTagFilter}`
        : "No principles yet";
      section.createEl("div", {
        text: emptyText,
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

    // Filter out snoozed ideas (#future, #snooze, #snoozed)
    ideas = ideas.filter(idea =>
      !idea.tags.includes("#future") &&
      !idea.tags.includes("#snooze") &&
      !idea.tags.includes("#snoozed")
    );

    // Keep reference to full list for child priority lookup
    const allIdeasForChildLookup = ideas;

    // Filter out child items (they'll be rendered under their parent header)
    ideas = ideas.filter(idea => idea.parentLineNumber === undefined);

    // Apply tag filter if active
    if (this.activeTagFilter) {
      ideas = ideas.filter(idea => idea.tags.includes(this.activeTagFilter!));
    }

    // Sort by priority (focus first)
    // Pass full list for accurate child priority lookup
    ideas = this.sortTodosByPriority(ideas, allIdeasForChildLookup);

    const section = container.createEl("div", { cls: "ideas-section" });

    const header = section.createEl("div", { cls: "todo-section-header" });
    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "Ideas";
    this.renderFilterIndicator(header);

    if (ideas.length === 0) {
      const emptyText = this.activeTagFilter
        ? `No ideas matching ${this.activeTagFilter}`
        : "No ideas yet";
      section.createEl("div", {
        text: emptyText,
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

  // -----------------------------------------------------------------------
  // Phase 2: Immersive Focus Mode
  // -----------------------------------------------------------------------

  /**
   * Active TODOs eligible for the focus queue: not snoozed, not ideas, not
   * todones. Children are kept in the input so `buildFocusQueue` can use them
   * for effective-focus detection on header items, but only top-level items
   * become queue entries.
   */
  private getActiveTodosForFocus(): TodoItem[] {
    return this.scanner.getTodos().filter(t =>
      !t.tags.includes("#future") &&
      !t.tags.includes("#snooze") &&
      !t.tags.includes("#snoozed") &&
      !t.tags.includes("#idea") &&
      !t.tags.includes("#ideas") &&
      !t.tags.includes("#ideation")
    );
  }

  /** Build the focus queue from current scanner data; respects continue-mode. */
  private rebuildFocusQueue(): void {
    const active = this.getActiveTodosForFocus();
    const inContinueMode = this.focusQueue?.inContinueMode === true;
    const result = buildFocusQueue(active, this.focusQueueLimit, {
      forceFallback: inContinueMode,
    });
    this.focusQueue = {
      items: result.items,
      source: result.source,
      inContinueMode,
    };
  }

  private renderFocusCard(container: HTMLElement): void {
    // Slim sidebar header — anchors the user in the plugin without the tab
    // chrome. Logo still opens About; the kebab menu carries the same actions
    // as the regular sidebar.
    const header = container.createEl("div", { cls: "sidebar-header sidebar-header-focus" });
    const titleEl = header.createEl("h4", { cls: "sidebar-title" });
    const logoEl = titleEl.createEl("span", { cls: "space-command-logo clickable-logo", text: "␣⌘" });
    logoEl.addEventListener("click", () => this.onShowAbout());
    titleEl.appendText(" TODOs");
    this.createSidebarMenuButton(header);

    if (!this.focusQueue) {
      this.rebuildFocusQueue();
    }
    const state = this.focusQueue!;

    if (state.items.length === 0) {
      if (state.source === "empty" || state.inContinueMode) {
        this.renderFocusEmpty(container);
      } else {
        this.renderFocusCompletion(container);
      }
      return;
    }

    this.renderFocusItem(container, state);
  }

  private renderFocusItem(container: HTMLElement, state: FocusQueueState): void {
    const enterClass =
      this.pendingFocusEnter === "skip" ? " focus-card--entering-skip" :
      this.pendingFocusEnter === "complete" ? " focus-card--entering-complete" :
      "";
    this.pendingFocusEnter = null;
    const card = container.createEl("div", { cls: `focus-card${enterClass}` });

    const item = state.items[0];

    // Source heading: parent header text when available, otherwise file name.
    // An arrow on the far right opens the source — same affordance as the
    // arrows on each row in the regular sidebar, so the action reads the same
    // in both views.
    const sourceHeadingText = this.getFocusSourceHeading(item);
    if (sourceHeadingText) {
      const fromEl = card.createEl("div", { cls: "focus-card-from" });
      fromEl.createEl("span", { cls: "focus-card-from-prefix", text: "Focus: " });
      fromEl.createEl("span", { cls: "focus-card-from-text", text: sourceHeadingText });
      const linkBtn = fromEl.createEl("a", {
        cls: "focus-card-from-link",
        text: "→",
        href: "#",
        attr: { "aria-label": "Open source", title: "Open source" },
      });
      linkBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const blockEnd = item.childLineNumbers?.length
          ? Math.max(...item.childLineNumbers)
          : undefined;
        openFileAtLine(this.app, item.file, item.lineNumber, blockEnd);
      });
    }

    // Title row: checkbox + task text. Checking the box completes the task,
    // matching the in-doc affordance. The checkbox lives inside a wrapper
    // whose height matches the title's first-line height — this gives us
    // reliable first-line vertical centring regardless of theme overrides
    // on `<input type="checkbox">` or em-unit edge cases.
    const taskRow = card.createEl("div", { cls: "focus-card-task" });
    const checkboxWrap = taskRow.createEl("div", { cls: "focus-card-checkbox-wrap" });
    const checkbox = checkboxWrap.createEl("input", {
      type: "checkbox",
      cls: "focus-card-checkbox",
    });
    checkbox.addEventListener("change", async () => {
      if (!checkbox.checked) return;
      checkbox.disabled = true;
      await this.handleFocusDone(item);
    });

    const titleEl = taskRow.createEl("div", { cls: "focus-card-title" });
    const titleConfig = this.todoConfig;
    const cleanTitle = item.text.replace(titleConfig.tagToStrip, "").trim();
    const titleNoTags = this.stripTagsPreservingCode(cleanTitle);
    if (this.makeLinksClickable) {
      this.renderTextWithLinks(titleNoTags, titleEl);
    } else {
      titleEl.appendText(this.stripMarkdownSyntax(titleNoTags).replace(/\s+/g, " ").trim());
    }

    // Tags + date on a single row: tags as faded chiclets on the left, date
    // pushed to the right. The row collapses gracefully when only one is present.
    const visibleTags = this.getFocusVisibleTags(item);
    const date = getItemDate(item);
    const hasDate = date.kind !== "none" && !!date.iso;
    if (visibleTags.length > 0 || hasDate) {
      const metaRow = card.createEl("div", { cls: "focus-card-meta" });
      const tagsEl = metaRow.createEl("div", { cls: "focus-card-tags" });
      const projectColourMap = this.getProjectColourMap();
      const MAX_VISIBLE = 6;
      const shown = visibleTags.slice(0, MAX_VISIBLE);
      const overflow = visibleTags.length - shown.length;
      for (const tag of shown) {
        const colourInfo = getTagColourInfo(tag, projectColourMap);
        const tagEl = tagsEl.createEl("span", { cls: "tag focus-card-tag", text: tag });
        tagEl.dataset.scTagType = colourInfo.type;
        tagEl.dataset.scPriority = colourInfo.priority.toString();
      }
      if (overflow > 0) {
        tagsEl.createEl("span", {
          cls: "focus-card-tags-more",
          text: `+${overflow} more`,
        });
      }
      if (hasDate) {
        metaRow.createEl("span", {
          cls: "focus-card-date",
          text: this.formatFocusDate(date.iso!),
        });
      }
    }

    // Actions: Complete + Skip
    const actions = card.createEl("div", { cls: "focus-card-actions" });
    const doneBtn = actions.createEl("button", {
      cls: "focus-card-btn focus-card-btn-done",
      text: "Complete",
    });
    doneBtn.addEventListener("click", () => this.handleFocusDone(item));

    const skipBtn = actions.createEl("button", {
      cls: "focus-card-btn focus-card-btn-skip",
      text: "Skip",
    });
    // Disable Skip only when there's truly nothing else to show. With a queue
    // size of 1, we still allow Skip if other candidates exist outside the
    // current queue — Skip will pull the next-best item from the wider pool.
    if (state.items.length < 2 && !this.hasMoreFocusCandidates(state.items[0])) {
      skipBtn.disabled = true;
    }
    skipBtn.addEventListener("click", () => this.handleFocusSkip());

    // Exit link below the actions
    const exitRow = card.createEl("div", { cls: "focus-card-exit-row" });
    const exitLink = exitRow.createEl("a", {
      cls: "focus-card-exit",
      href: "#",
    });
    exitLink.appendText("Exit focus mode ");
    exitLink.createEl("span", { cls: "focus-card-exit-arrow", text: "→" });
    exitLink.addEventListener("click", (e) => {
      e.preventDefault();
      this.handleFocusExit();
    });
  }

  /**
   * Build the heading shown above the focus title: the parent header text when
   * the item is a child of a header block, otherwise the file's display name.
   */
  private getFocusSourceHeading(item: TodoItem): string {
    if (item.parentLineNumber !== undefined) {
      const parent = this.scanner.getTodos().find(
        t => t.filePath === item.filePath && t.lineNumber === item.parentLineNumber
      );
      if (parent) {
        const parentClean = parent.text
          .replace(/^#{1,6}\s+/, "")
          .replace(this.todoConfig.tagToStrip, "")
          .replace(/#[\w-]+/g, "")
          .replace(/@[\w][\w.-]*/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (parentClean) return parentClean;
      }
    }
    return item.file.basename || item.file.name;
  }

  /** Format an ISO date as `D/M/YYYY` (e.g. `5/5/2026`). */
  private formatFocusDate(iso: string): string {
    return (moment as any)(iso).format("D/M/YYYY");
  }

  /**
   * Build the sidebar's kebab (vertical-dots) menu button and append it to
   * the given parent. Used by both the regular sidebar header and the slim
   * Focus Mode header so they share one menu definition.
   */
  private createSidebarMenuButton(parent: HTMLElement): HTMLButtonElement {
    const menuBtn = parent.createEl("button", {
      cls: "clickable-icon sidebar-menu-btn",
      attr: { "aria-label": "Menu" },
    });
    menuBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>';

    menuBtn.addEventListener("click", (evt) => {
      const menu = new Menu();

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

      menu.addItem((item) => {
        item
          .setTitle("Triage")
          .setIcon("siren")
          .onClick(() => this.onShowTriage());
      });

      menu.addItem((item) => {
        item
          .setTitle("Stats")
          .setIcon("bar-chart-2")
          .onClick(() => this.onShowStats());
      });

      menu.addSeparator();

      menu.addItem((item) => {
        item
          .setTitle("About")
          .setIcon("info")
          .onClick(() => this.onShowAbout());
      });

      menu.addItem((item) => {
        item
          .setTitle("Settings")
          .setIcon("settings")
          .onClick(() => {
            (this.app as any).setting.open();
            (this.app as any).setting.openTabById("space-command");
          });
      });

      menu.showAtMouseEvent(evt);
    });

    return menuBtn;
  }

  private renderFocusCompletion(container: HTMLElement): void {
    const card = container.createEl("div", { cls: "focus-card focus-card-complete" });
    card.createEl("div", { cls: "focus-card-complete-title", text: "All focus tasks done." });
    card.createEl("div", { cls: "focus-card-complete-subtitle", text: "Nice work." });

    const actions = card.createEl("div", { cls: "focus-card-actions focus-card-actions-stack" });
    const exitBtn = actions.createEl("button", {
      cls: "focus-card-btn focus-card-btn-exit",
      text: "Exit focus mode",
    });
    exitBtn.addEventListener("click", () => this.handleFocusExit());

    const continueBtn = actions.createEl("button", {
      cls: "focus-card-btn focus-card-btn-continue",
      text: "Continue with next priority task",
    });
    continueBtn.addEventListener("click", () => this.handleFocusContinue());
  }

  private renderFocusEmpty(container: HTMLElement): void {
    const card = container.createEl("div", { cls: "focus-card focus-card-empty" });
    const inContinue = this.focusQueue?.inContinueMode === true;
    const title = inContinue ? "All caught up." : "No focus items.";
    const subtitle = inContinue
      ? "No more priority tasks to surface."
      : "Tag a TODO with #focus to get started.";
    card.createEl("div", { cls: "focus-card-empty-title", text: title });
    card.createEl("div", { cls: "focus-card-empty-subtitle", text: subtitle });

    const actions = card.createEl("div", { cls: "focus-card-actions focus-card-actions-stack" });
    const exitBtn = actions.createEl("button", {
      cls: "focus-card-btn focus-card-btn-exit",
      text: "Exit focus mode",
    });
    exitBtn.addEventListener("click", () => this.handleFocusExit());
  }

  /**
   * Tags shown as badges on the focus card. Strip plugin/system tags and
   * snooze markers; keep project, priority, and custom tags.
   */
  private getFocusVisibleTags(item: TodoItem): string[] {
    const HIDDEN = new Set([
      "#todo", "#todos", "#todone", "#todones",
      "#idea", "#ideas", "#ideation",
      "#principle", "#principles",
      "#moved",
      "#future", "#snooze", "#snoozed",
    ]);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const tag of item.tags) {
      const lower = tag.toLowerCase();
      if (HIDDEN.has(lower)) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      result.push(tag);
    }
    return result;
  }

  private handleFocusEnter(): void {
    // Snapshot the user's place in the sidebar so Exit can restore it.
    this.prevActiveTab = this.activeTab;
    const scrollEl = this.containerEl.children[1] as HTMLElement | undefined;
    this.prevScrollTop = scrollEl?.scrollTop ?? 0;

    this.focusModeActive = true;
    this.focusQueue = null; // build fresh on render
    void this.setFocusModeActive(true);
    this.render();
  }

  private async handleFocusDone(item: TodoItem): Promise<void> {
    const card = this.containerEl.querySelector(".focus-card") as HTMLElement | null;
    // No card in the DOM (edge case): just write and let the normal render flow run.
    if (!card) {
      await this.processor.completeTodo(item, this.defaultTodoneFile);
      return;
    }

    // Run the strikethrough → flash → fade animation in parallel with the file
    // write. The auto-rerender listener is suppressed for the duration; we kick
    // off the render ourselves once both finish so the next card mounts with a
    // matching entrance.
    this.animatingFocusTransition = true;
    this.pendingFocusEnter = "complete";
    card.classList.add("focus-card--leaving-complete");

    const writePromise = this.processor.completeTodo(item, this.defaultTodoneFile);
    await Promise.all([
      writePromise,
      this.waitForAnimationEnd(card, 700),
    ]);

    this.animatingFocusTransition = false;
    this.focusQueue = null;
    this.render();
  }

  private async handleFocusSkip(): Promise<void> {
    if (!this.focusQueue || this.focusQueue.items.length === 0) return;

    // Compute the next queue state up front so we know whether Skip has
    // anything to do — bail before animating if not.
    let nextQueue: FocusQueueState | null = null;
    if (this.focusQueue.items.length >= 2) {
      nextQueue = {
        ...this.focusQueue,
        items: rotateQueue(this.focusQueue.items),
      };
    } else {
      const skipped = this.focusQueue.items[0];
      const active = this.getActiveTodosForFocus();
      const result = buildFocusQueue(active, Math.max(2, this.focusQueueLimit), {
        forceFallback: this.focusQueue.inContinueMode,
      });
      const remaining = result.items.filter(
        t => !(t.filePath === skipped.filePath && t.lineNumber === skipped.lineNumber)
      );
      if (remaining.length === 0) return;
      nextQueue = {
        items: [remaining[0]],
        source: result.source,
        inContinueMode: this.focusQueue.inContinueMode,
      };
    }

    // Slide the current card out to the left, then mount the next one with the
    // matching slide-in-from-right entrance.
    const card = this.containerEl.querySelector(".focus-card") as HTMLElement | null;
    if (card) {
      this.pendingFocusEnter = "skip";
      card.classList.add("focus-card--leaving-skip");
      await this.waitForAnimationEnd(card, 240);
    }

    this.focusQueue = nextQueue;
    this.render();
  }

  /**
   * Resolve when the element's CSS animation ends — or after `fallbackMs` if
   * no `animationend` event fires (defensive: stale element, reduced-motion,
   * or no animation actually applied).
   */
  private waitForAnimationEnd(el: HTMLElement, fallbackMs: number): Promise<void> {
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.removeEventListener("animationend", finish);
        resolve();
      };
      el.addEventListener("animationend", finish, { once: true });
      setTimeout(finish, fallbackMs);
    });
  }

  /**
   * True when there's at least one focus candidate other than `current` —
   * used to keep Skip enabled even with a single-item queue when more work
   * is waiting in the wider pool.
   */
  private hasMoreFocusCandidates(current: TodoItem | undefined): boolean {
    if (!current) return false;
    const active = this.getActiveTodosForFocus();
    const result = buildFocusQueue(active, Math.max(2, this.focusQueueLimit), {
      forceFallback: this.focusQueue?.inContinueMode === true,
    });
    return result.items.some(
      t => !(t.filePath === current.filePath && t.lineNumber === current.lineNumber)
    );
  }

  private handleFocusExit(): void {
    if (this.prevActiveTab) {
      this.activeTab = this.prevActiveTab;
      this.prevActiveTab = null;
    }
    this.focusModeActive = false;
    this.focusQueue = null;
    void this.setFocusModeActive(false);
    this.render();

    // Restore prior scroll position after the new render has committed.
    const scrollEl = this.containerEl.children[1] as HTMLElement | undefined;
    if (scrollEl) {
      scrollEl.scrollTop = this.prevScrollTop;
    }
    this.prevScrollTop = 0;
  }

  private handleFocusContinue(): void {
    this.focusQueue = {
      items: [],
      source: "priority-fallback",
      inContinueMode: true,
    };
    this.rebuildFocusQueue();
    this.render();
  }

}
