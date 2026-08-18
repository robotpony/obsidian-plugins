import { ItemView, WorkspaceLeaf, TFile, Menu, Modal, MarkdownRenderer, Component, moment, setIcon } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { TodoProcessor } from "./TodoProcessor";
import { ProjectManager, projectFilePath } from "./ProjectManager";
import { ProjectScanner, ScannedProject } from "./ProjectScanner";
import { ProjectSyncManager } from "./ProjectSyncManager";
import { ParsedProjectItem } from "./StructuredFileParser";
import {
  setProjectItemCompletion,
  setProjectItemPriority,
  addProjectItemTag,
  removeProjectItemTag,
} from "./ProjectItemMutator";
import {
  ProjectsSidebarOptions,
  GROUP_ORDER,
  GroupFileHint,
  HandTypedGroup,
  browsableUrl,
  homeRelativePath,
  groupHandTypedItems,
  cleanDisplayText,
  calculateFocusPriority as calculateProjectFocusPriority,
  calculateLaterPriority as calculateProjectLaterPriority,
} from "./ProjectsSidebarView";
import { TeamManager } from "./TeamManager";
import { TodoItem, ProjectInfo, ItemRenderConfig, FocusQueueState } from "./types";
import { ContextMenuHandler } from "./ContextMenuHandler";
import { getPriorityValue, compareTodoItems, compareWithEffectivePriority, hasTag, openFileAtLine, extractMentions, resolveMentions, resolveEffectiveMentions, showNotice, getTagColourInfo, extractCompletionDate, buildFocusQueue, getItemDate, tallyProjectTags, itemMatchesTagFilter } from "./utils";

export const VIEW_TYPE_TODO_SIDEBAR = "warped-todo-sidebar";

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
  private activeTab: 'todos' | 'ideas' | 'projects' = 'todos';
  private activeTagFilter: string | null = null;
  private activeAssigneeFilter: string | null = null;
  // Crossfade transition for filter changes — guards against overlapping
  // animations if the user clicks pills in quick succession.
  private filterFadeTimer: number | null = null;
  private teamManager: TeamManager;
  private defaultAssignee: string;
  private priorityTags: string[];
  // Immersive focus mode state.
  private focusQueueLimit: number;
  private focusModeActive: boolean = false;
  private focusQueue: FocusQueueState | null = null;
  private setFocusModeActive: (active: boolean) => Promise<void>;
  // Snapshot for restoring sidebar position on Exit.
  private prevActiveTab: 'todos' | 'ideas' | 'projects' | null = null;
  private prevScrollTop: number = 0;
  private openDropdown: HTMLElement | null = null;
  private openDropdownTrigger: HTMLElement | null = null;
  private openInfoPopup: HTMLElement | null = null;
  private onShowAbout: () => void;
  private onShowStats: () => void;
  private onOpenSettings: () => void;

  // ===== Projects tab state =====
  // Projects used to be a second, standalone ItemView/leaf; folded in here
  // as a third tab (see ProjectsSidebarView.ts's file-level comment) so it
  // shares this view's header, tab row, and kebab menu instead of growing
  // its own of each.
  private projectScanner: ProjectScanner;
  private syncManager: ProjectSyncManager;
  private getProjectsOptions: () => ProjectsSidebarOptions;
  private projectsMode: 'list' | 'detail' = 'list';
  private activeProjectName: string | null = null;
  private projectsFilterText: string = '';
  private scannedProjects: ScannedProject[] = [];
  private projectsSyncing: boolean = false;
  private projectsSyncedOnce: boolean = false;
  // Tracks the active file's path so handleProjectActiveFileChange can tell
  // "the active file genuinely changed" from "some workspace event fired for
  // the same file" (Obsidian fires these often, for reasons unrelated to
  // navigation). Without this, a project note staying open while the user
  // switched away from the Projects tab could get silently yanked back into
  // detail mode by the next such event.
  private lastKnownProjectFilePath: string | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    scanner: TodoScanner,
    processor: TodoProcessor,
    projectManager: ProjectManager,
    projectScanner: ProjectScanner,
    syncManager: ProjectSyncManager,
    getProjectsOptions: () => ProjectsSidebarOptions,
    onOpenSettings: () => void,
    defaultTodoneFile: string,
    priorityTags: string[],
    activeTodosLimit: number,
    focusListLimit: number,
    makeLinksClickable: boolean,
    onShowAbout: () => void,
    onShowStats: () => void,
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
    this.projectScanner = projectScanner;
    this.syncManager = syncManager;
    this.getProjectsOptions = getProjectsOptions;
    this.onOpenSettings = onOpenSettings;
    this.defaultTodoneFile = defaultTodoneFile;
    this.activeTodosLimit = activeTodosLimit;
    this.focusListLimit = focusListLimit;
    this.makeLinksClickable = makeLinksClickable;
    this.onShowAbout = onShowAbout;
    this.onShowStats = onShowStats;
    this.teamManager = teamManager ?? new TeamManager(this.app, "team.md");
    this.defaultAssignee = defaultAssignee;
    this.priorityTags = priorityTags;
    this.focusQueueLimit = focusQueueLimit;
    this.focusModeActive = focusModeActive;
    this.setFocusModeActive = setFocusModeActive;

    // Initialize context menu handler
    this.contextMenuHandler = new ContextMenuHandler(
      this.app,
      processor,
      priorityTags,
      getMoveHistory,
      (tag: string) => this.switchToProjectsTab(tag)
    );
  }

  getViewType(): string {
    return VIEW_TYPE_TODO_SIDEBAR;
  }

  getDisplayText(): string {
    switch (this.activeTab) {
      case 'todos': return "TODOs";
      case 'ideas': return "IDEAs";
      case 'projects': return "Projects";
    }
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

  // Unified list item renderer for todos, ideas, and principles
  private renderListItem(
    list: HTMLElement,
    item: TodoItem,
    config: ItemRenderConfig,
    isChild: boolean = false
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
      // Wrap the checkbox so we can lock its vertical box to the text's
      // first-line height and centre it. A bare margin-top can't track
      // varying checkbox sizes across themes, which left the box drifting
      // 1–2px above the midline (and earlier attempts to nudge it landed
      // at the top of the line). Mirrors the focus-card-checkbox-wrap pattern.
      const checkboxWrap = rowContainer.createEl("div", {
        cls: `${config.classPrefix}-checkbox-wrap`,
      });
      const checkbox = checkboxWrap.createEl("input", {
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

    // Per-row tag pill removed in 0.x.x — tags are now filtered exclusively
    // through the tag cloud at the top of the sidebar. The right-click context
    // menu still surfaces snooze/filter/clear actions for individual items.

    // Source affordance — varies by row type:
    //   - Children: nothing. The header row above already has its arrow.
    //   - Headers: keep the → arrow at the end of the row.
    //   - Orphan items (no parent header): nothing on the row. The synthesised
    //     section heading rendered above the run carries the source link.
    if (isHeader) {
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
    }

    // If this is a header with children, render children indented below
    if (hasChildren) {
      const childrenContainer = listItem.createEl("ul", { cls: `${config.classPrefix}-children` });
      const allItems = this.getItemsForType(config.type);
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
        this.renderListItem(childrenContainer, childItem, config, true);
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

    // Auto-follow: opening a project's note elsewhere updates Projects tab
    // state (see handleProjectActiveFileChange) so it's ready the next time
    // the user switches there — it doesn't force a tab switch away from
    // whatever the user's actually doing.
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.handleProjectActiveFileChange()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.handleProjectActiveFileChange()));

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

  /**
   * Apply the active tag filter while keeping header items whose children
   * carry the tag. Without this, filtering by a tag like `#mta` would drop
   * the parent header (which doesn't itself have `#mta`) along with all of
   * its tagged children — leaving the user staring at "No items matching"
   * even though matching items clearly exist. Mirrors the parent-match
   * pattern the assignee filter already uses.
   *
   * Matching goes through `itemMatchesTagFilter` (explicit tag or
   * `inferredFileTag`), shared with the focus queue's own tag scoping —
   * see PLAN.md's Phase 7 — so a project's untagged note items are scoped
   * consistently everywhere, not just counted in `ProjectManager`'s stats.
   */
  private filterByActiveTag(items: TodoItem[], allItemsForChildLookup: TodoItem[]): TodoItem[] {
    if (!this.activeTagFilter) return items;
    const tag = this.activeTagFilter;
    return items.filter(item => {
      if (itemMatchesTagFilter(item, tag)) return true;
      if (item.isHeader && item.childLineNumbers?.length) {
        return item.childLineNumbers.some(childLine => {
          const child = allItemsForChildLookup.find(
            t => t.filePath === item.filePath && t.lineNumber === childLine
          );
          return !!child && itemMatchesTagFilter(child, tag);
        });
      }
      return false;
    });
  }

  /**
   * Apply a tag filter change with a brisk crossfade (80ms out, 100ms in)
   * so list items don't flash in and out. The fade class lives on the same
   * sidebar container that survives `render()`, so the new content starts at
   * opacity 0 and animates back to 1 once the class is removed on the next
   * frame.
   */
  private setTagFilterWithCrossfade(newFilter: string | null): void {
    const container = this.containerEl.children[1] as HTMLElement | undefined;
    // No container yet, or reduced motion preference: skip the animation.
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!container || reducedMotion) {
      this.activeTagFilter = newFilter;
      this.render();
      return;
    }

    // If a fade is already mid-flight, snap to the new filter rather than
    // stacking timers (avoids visual jank from rapid pill clicking).
    if (this.filterFadeTimer !== null) {
      window.clearTimeout(this.filterFadeTimer);
      this.filterFadeTimer = null;
      container.classList.remove("sc-filter-fading");
      this.activeTagFilter = newFilter;
      this.render();
      return;
    }

    container.classList.add("sc-filter-fading");
    this.filterFadeTimer = window.setTimeout(() => {
      this.filterFadeTimer = null;
      this.activeTagFilter = newFilter;
      this.render();
      // Same container element, class still present after empty()+repopulate.
      // Pull it on the next frame so the in-transition kicks in.
      const c = this.containerEl.children[1] as HTMLElement | undefined;
      if (c) {
        requestAnimationFrame(() => c.classList.remove("sc-filter-fading"));
      }
    }, 80);
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("warped-todo-sidebar");
    container.removeClass("sidebar-focus-mode-active");

    // Header — always rendered in full so the button positions stay fixed
    // whether focus mode is on or off. The eye button toggles focus mode;
    // the other three behave exactly like normal tab buttons even while
    // focus is active — clicking one exits focus and switches in one click,
    // same as switching between any two of them normally. The only
    // intentional difference for focus mode is the eye icon's colour when
    // active (yellow, via focus-mode-active) — see switchTab().
    const headerDiv = container.createEl("div", { cls: "sidebar-header" });
    const titleEl = headerDiv.createEl("h4", { cls: "sidebar-title" });
    const logoEl = titleEl.createEl("span", { cls: "warped-todo-logo clickable-logo", text: "␣⌘" });
    logoEl.addEventListener("click", () => this.onShowAbout());
    if (this.focusModeActive) {
      titleEl.appendText(" Focus");
    } else {
      switch (this.activeTab) {
        case 'todos': titleEl.appendText(" TODOs"); break;
        case 'ideas': titleEl.appendText(" IDEAs"); break;
        case 'projects': titleEl.appendText(" Projects"); break;
      }
    }

    // Tab navigation
    const tabNav = headerDiv.createEl("div", { cls: "sidebar-tab-nav" });

    const todosTab = tabNav.createEl("button", {
      cls: `sidebar-tab-btn${!this.focusModeActive && this.activeTab === 'todos' ? ' active' : ''}`,
      attr: { "aria-label": "TODOs" },
    });
    todosTab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5"/><path d="m9 11 3 3L22 4"/></svg>';
    todosTab.addEventListener("click", () => this.switchTab('todos'));

    // Eye icon — toggles focus mode. Active (yellow) when focus is on so the
    // user can click the same spot to exit without moving the mouse.
    const focusModeTopBtn = tabNav.createEl("button", {
      cls: `sidebar-tab-btn focus-mode-toggle-btn${this.focusModeActive ? ' focus-mode-active' : ''}`,
      attr: { "aria-label": this.focusModeActive ? "Exit focus mode" : "Enter focus mode" },
    });
    focusModeTopBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    focusModeTopBtn.addEventListener("click", () => {
      if (this.focusModeActive) {
        this.handleFocusExit();
      } else {
        this.handleFocusEnter();
      }
    });

    const ideasTab = tabNav.createEl("button", {
      cls: `sidebar-tab-btn${!this.focusModeActive && this.activeTab === 'ideas' ? ' active' : ''}`,
      attr: { "aria-label": "Ideas" },
    });
    ideasTab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>';
    ideasTab.addEventListener("click", () => this.switchTab('ideas'));

    // Projects is a tab like TODOs/Ideas, not a separate view — it used to
    // be a second ItemView/leaf, which meant its own icon in the sidebar
    // dock's tab strip and a back button in place of just clicking the tab
    // again. Folded in as a third tab so it's identical in kind to Ideas.
    const projectsTab = tabNav.createEl("button", {
      cls: `sidebar-tab-btn${!this.focusModeActive && this.activeTab === 'projects' ? ' active' : ''}`,
      attr: { "aria-label": "Projects" },
    });
    projectsTab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5"></path><circle cx="13" cy="12" r="2"></circle><path d="M18 19c-2.8 0-5-2.2-5-5v8"></path><circle cx="20" cy="19" r="2"></circle></svg>';
    // No tag → always resets to the project list, even if already on this
    // tab in detail view. That's the point: clicking Projects again is the
    // way back, no separate back-arrow button needed.
    projectsTab.addEventListener("click", () => this.switchToProjectsTab());

    // Kebab menu stays accessible in all modes (refresh, stats, about)
    this.createSidebarMenuButton(headerDiv);

    // Content wrapper — font scale applied here only, so the header is unaffected
    const content = container.createEl("div", { cls: "sidebar-content" });

    if (this.focusModeActive) {
      content.addClass("sidebar-focus-mode-active");
      this.renderFocusCard(content);
      return;
    }

    switch (this.activeTab) {
      case 'todos':  this.renderTodosContent(content); break;
      case 'ideas':  this.renderIdeasContent(content); break;
      case 'projects': this.renderProjectsTabContent(content); break;
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
    // No tab-level header — the tab name already says "IDEAs". Filter pills
    // surface inside the section that owns the matching items.
    // Principles are still scanned and surface in the project-info popup,
    // but they no longer get their own section here.

    // Tag cloud built from all ideas — snoozed ideas surface here like any
    // other tagged item now (no dedicated Snoozed tab; see BUGS.md). Clicking
    // a pill applies activeTagFilter, which renderActiveIdeas already respects.
    this.renderSimpleTagCloud(container, this.scanner.getIdeas());

    this.renderActiveIdeas(container);
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
      this.setTagFilterWithCrossfade(null);
    });
  }

  private renderProjects(container: HTMLElement): void {
    const projects = this.projectManager.getProjects();

    const section = container.createEl("div", { cls: "projects-section tag-cloud-section" });

    // No section header here. The eye icon (focus mode) lives in the top tab
    // nav now; the active-tag filter pill renders inside the TODO list header
    // when set, so this section is just the tag cloud.

    // Build the cloud entries. #focus and #p0 are pinned first when in use;
    // ProjectManager already filters those out of its results, so adding them
    // here will not double-render.
    type CloudEntry = { tag: string; project: ProjectInfo | null; pinned: boolean; activeCount?: number };
    const entries: CloudEntry[] = [];

    const todos = this.scanner.getTodos();

    // Active count per tag — used to skip project pills for a header whose
    // own tags are live but has no real active child (clicking it would
    // yield "No TODOs matching", which is just noise). Shares `isActiveTodo`
    // with `renderActiveTodos` so the cloud and the list always agree on
    // what counts as active — see BUGS.md's "tag cloud shows pills with
    // zero matching TODOs". Pinned tags (#focus / #p0) are intentionally
    // NOT gated by this: they're priority indicators, not project filters,
    // and should appear whenever any TODO carries them.
    const allTodones = this.scanner.getTodones();
    const activeTodos = todos.filter(t => this.isActiveTodo(t, allTodones, todos));
    const activeTagCounts = new Map<string, number>();
    for (const t of activeTodos) {
      for (const tag of t.tags) {
        activeTagCounts.set(tag, (activeTagCounts.get(tag) ?? 0) + 1);
      }
    }

    const hasAnyFocus = todos.some(t => hasTag(t.tags, "#focus"));
    const hasAnyP0 = todos.some(t => hasTag(t.tags, "#p0"));
    if (hasAnyFocus) entries.push({ tag: "#focus", project: null, pinned: true });
    if (hasAnyP0) entries.push({ tag: "#p0", project: null, pinned: true });

    // Project tags sorted: focus tier first, then highest priority, then count.
    const sortedProjects = [...projects].sort((a, b) => {
      if (a.hasFocusItems && !b.hasFocusItems) return -1;
      if (!a.hasFocusItems && b.hasFocusItems) return 1;
      const priorityDiff = a.highestPriority - b.highestPriority;
      if (priorityDiff !== 0) return priorityDiff;
      return b.count - a.count;
    });
    for (const p of sortedProjects) {
      const activeCount = activeTagCounts.get(p.tag) ?? 0;
      // Skip projects with no active work (see isActiveTodo) — they'd just
      // empty out on click. Obsidian's tag search already covers the
      // all-up view.
      if (activeCount === 0) continue;
      entries.push({ tag: p.tag, project: p, pinned: false, activeCount });
    }

    if (entries.length === 0) {
      section.createEl("div", {
        text: "No focus tags yet",
        cls: "todo-empty",
      });
      return;
    }

    // Soft cap so the cloud stays around 4–5 lines in a typical sidebar width.
    // Pinned tags are never trimmed.
    const TAG_CLOUD_CAP = 15;
    const totalCount = entries.length;
    const visible = entries.slice(0, Math.max(TAG_CLOUD_CAP, entries.filter(e => e.pinned).length));

    const cloud = section.createEl("div", { cls: "tag-cloud" });
    for (const entry of visible) {
      this.renderTagCloudPill(cloud, entry.tag, entry.project, entry.pinned, entry.activeCount);
    }

    if (totalCount > visible.length) {
      const more = section.createEl("div", {
        cls: "todo-more-indicator",
        text: `+${totalCount - visible.length} more`,
      });
      more.setAttribute("title", `Showing ${visible.length} of ${totalCount} tags`);
    }

    // Assignee pills — only when a team is configured
    const team = this.teamManager.getTeam();
    if (team.length > 0) {
      const meHandle = this.teamManager.resolveMe();
      const mentionCounts = new Map<string, number>();
      let unassignedCount = 0;
      for (const t of activeTodos) {
        if (t.isHeader) continue;
        const effective = resolveEffectiveMentions(t, meHandle, this.defaultAssignee);
        if (effective.length === 0) {
          unassignedCount++;
        } else {
          for (const m of effective) {
            mentionCounts.set(m, (mentionCounts.get(m) ?? 0) + 1);
          }
        }
      }

      // @me first, then other handles sorted alphabetically, then @unassigned
      if (meHandle && mentionCounts.has(meHandle)) {
        this.renderAssigneePill(cloud, "me", mentionCounts.get(meHandle)!, true);
      }
      for (const [handle, count] of [...mentionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (handle === meHandle) continue;
        this.renderAssigneePill(cloud, handle, count, false);
      }
      if (unassignedCount > 0) {
        this.renderAssigneePill(cloud, "__unassigned__", unassignedCount, false);
      }
    }
  }

  private renderAssigneePill(container: HTMLElement, handle: string, count: number, isMe: boolean): void {
    const isActive = this.activeAssigneeFilter === handle;
    const label = handle === "__unassigned__" ? "@unassigned" : `@${handle}`;

    const classes = [
      "tag-cloud-pill",
      "tag-cloud-pill-mention",
      isMe ? "tag-cloud-pill-mention-me" : "",
      isActive ? "tag-cloud-pill-active" : "",
    ].filter(Boolean).join(" ");

    const pill = container.createEl("button", {
      cls: classes,
      attr: {
        type: "button",
        "aria-pressed": isActive ? "true" : "false",
        title: `${count} item${count === 1 ? "" : "s"}`,
      },
    });
    pill.appendText(label);

    pill.addEventListener("click", () => {
      this.activeAssigneeFilter = isActive ? null : handle;
      this.render();
    });
  }

  /**
   * Lightweight tag cloud for tabs without project metadata (Ideas). Builds
   * entries from the items' own tags using the same exclusion rules
   * `ProjectManager` uses for the TODOs cloud. Pills route through the same
   * `setTagFilterWithCrossfade` flow, so filtering on this tab feels and
   * persists identically.
   *
   * Renders nothing (not even an empty-state message) when there are no
   * project-style tags to show — the Ideas list may legitimately contain
   * only untagged entries.
   */
  private renderSimpleTagCloud(container: HTMLElement, items: TodoItem[]): void {
    const counts = tallyProjectTags(items, this.priorityTags);
    if (counts.size === 0) return;

    const entries = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));

    const section = container.createEl("div", { cls: "projects-section tag-cloud-section" });

    const TAG_CLOUD_CAP = 15;
    const totalCount = entries.length;
    const visible = entries.slice(0, TAG_CLOUD_CAP);

    const cloud = section.createEl("div", { cls: "tag-cloud" });
    for (const entry of visible) {
      this.renderTagCloudPill(cloud, entry.tag, null, false, entry.count);
    }

    if (totalCount > visible.length) {
      const more = section.createEl("div", {
        cls: "todo-more-indicator",
        text: `+${totalCount - visible.length} more`,
      });
      more.setAttribute("title", `Showing ${visible.length} of ${totalCount} tags`);
    }
  }

  private renderTagCloudPill(
    container: HTMLElement,
    tag: string,
    project: ProjectInfo | null,
    pinned: boolean,
    activeCount?: number
  ): void {
    const isActiveFilter = this.activeTagFilter === tag;
    // The pinned #focus pill is itself a focus tag; project pills inherit focus
    // styling whenever they contain at least one #focus item.
    const isFocusTag = tag === "#focus" || project?.hasFocusItems === true;

    const classes = [
      "tag-cloud-pill",
      pinned ? "tag-cloud-pill-pinned" : "",
      isFocusTag ? "tag-cloud-pill-focus" : "",
      isActiveFilter ? "tag-cloud-pill-active" : "",
    ].filter(Boolean).join(" ");

    // Tooltip surfaces both numbers when they differ so the user knows the
    // pill represents a curated active subset, not the full historical count.
    // For non-project clouds (Ideas), `activeCount` is the only number we
    // have — show it as a plain item count.
    let title = tag;
    if (project) {
      const total = project.count;
      const active = activeCount ?? total;
      title = active === total
        ? `${total} item${total === 1 ? "" : "s"}`
        : `${active} active / ${total} total`;
    } else if (activeCount !== undefined) {
      title = `${activeCount} item${activeCount === 1 ? "" : "s"}`;
    }

    const pill = container.createEl("button", {
      cls: classes,
      attr: {
        type: "button",
        "aria-pressed": isActiveFilter ? "true" : "false",
        title,
      },
    });
    pill.appendText(tag);

    const toggleFilter = () => {
      this.setTagFilterWithCrossfade(isActiveFilter ? null : tag);
    };
    pill.addEventListener("click", toggleFilter);

    // Right-click context menu only makes sense for true project tags.
    if (project) {
      pill.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.contextMenuHandler.showProjectMenu(
          e,
          project,
          this.scanner,
          () => this.render(),
          (t) => {
            this.setTagFilterWithCrossfade(t);
          }
        );
      });
    }
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

  /**
   * Whether a TODO counts as active work — shared by `renderActiveTodos`
   * (the list) and `renderProjects` (the tag cloud) so the two agree on
   * what's live. Snoozed items (`#future`/`#snooze`/`#snoozed`) are an
   * ordinary tag here, not a filter — see BUGS.md's "demote snoozed to an
   * ordinary tag"; the Focus queue is the one place that still excludes
   * them (`getActiveTodosForFocus`, below). A non-header
   * item always counts. A header additionally needs at least one real
   * active child: complete, non-existent, or bold-subheading children
   * don't count, even though the header's own line may still carry live
   * tags — see BUGS.md's "tag cloud shows pills with zero matching TODOs"
   * for why this used to disagree between the two callers.
   */
  private isActiveTodo(todo: TodoItem, allTodones: TodoItem[], allTodos: TodoItem[]): boolean {
    if (!todo.isHeader) return true; // Not a header, its own tags are enough
    if (!todo.childLineNumbers) return true; // Standalone header, no child list to check
    if (todo.childLineNumbers.length === 0) return false; // All children were empty/skipped

    // Check if there are any active children (not complete, and exists)
    return todo.childLineNumbers.some(childLine => {
      // Check if child is complete
      const isComplete = allTodones.some(t => t.filePath === todo.filePath && t.lineNumber === childLine);
      if (isComplete) return false;
      // Check if child exists in todos
      const childItem = allTodos.find(t => t.filePath === todo.filePath && t.lineNumber === childLine);
      if (!childItem) {
        return false;
      }
      // Subheading labels are not tasks — skip them
      if (childItem.isSubheading) {
        return false;
      }
      return true; // Child is active
    });
  }

  private renderActiveTodos(container: HTMLElement): void {
    let todos = this.scanner.getTodos();

    // Filter out #idea items (they should only appear in Ideas tab)
    todos = todos.filter(todo =>
      !todo.tags.includes("#idea") &&
      !todo.tags.includes("#ideas") &&
      !todo.tags.includes("#ideation")
    );

    // Filter out child items (they'll be rendered under their parent header).
    todos = todos.filter(todo => todo.parentLineNumber === undefined);

    // Filter out header TODOs with no real active child (complete/
    // non-existent/subheading-only children). This prevents users from
    // having to mark headers done redundantly, and also handles the case
    // where child lines are empty/filtered out by the scanner.
    const allTodones = this.scanner.getTodones();
    const allTodosForChildLookup = this.scanner.getTodos();
    todos = todos.filter(todo => this.isActiveTodo(todo, allTodones, allTodosForChildLookup));

    // Apply tag filter if active (keeps headers whose children match)
    todos = this.filterByActiveTag(todos, this.scanner.getTodos());

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

    // No "TODO" title — the tab is already labelled. Render the header row
    // only when there's an active tag filter. CSS hides empty headers as a safety net.
    const header = section.createEl("div", { cls: "todo-section-header" });
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

    // Insert a synthesised section heading above each run of orphan items that
    // share the same source heading. Repeats on interleaved runs so the
    // current sort order is preserved (priority/focus first).
    let lastOrphanSectionKey: string | null = null;
    for (const todo of todos) {
      const isOrphan = !todo.isHeader && todo.parentLineNumber === undefined && !todo.isSubheading;
      if (isOrphan) {
        const sectionLabel = todo.sectionLabel?.trim() || todo.file.basename || todo.file.name;
        const sectionLine = todo.sectionLineNumber ?? 0;
        const sectionKey = `${todo.filePath}::${sectionLine}::${sectionLabel}`;
        if (sectionKey !== lastOrphanSectionKey) {
          this.renderOrphanSectionHeader(list, todo, sectionLabel, sectionLine);
          lastOrphanSectionKey = sectionKey;
        }
      } else {
        lastOrphanSectionKey = null;
      }
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

  /**
   * Render a synthesised "section" row above a run of orphan items that share
   * the same source heading. Mirrors the header-row pattern: the label is
   * plain text on the left, only the right-side `→` is the click-through to
   * the source file. Keeps the click target predictable across both shapes.
   */
  private renderOrphanSectionHeader(
    list: HTMLElement,
    item: TodoItem,
    label: string,
    sectionLine: number
  ): void {
    const li = list.createEl("li", { cls: "todo-orphan-section" });
    li.createEl("span", { cls: "todo-orphan-section-text", text: label });
    const link = li.createEl("a", {
      cls: "todo-orphan-section-link",
      text: "→",
      href: "#",
      attr: {
        "aria-label": `Open ${item.file.path}`,
        title: item.file.path,
      },
    });
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openFileAtLine(this.app, item.file, sectionLine);
    });
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

    // Title sits flush left — no chevron. Expanded state is signalled by the
    // content rows that appear below when the user clicks to expand.
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

  private renderActiveIdeas(container: HTMLElement): void {
    // Snoozed ideas (#future/#snooze/#snoozed) are an ordinary tag now — no
    // dedicated Snoozed tab, no exclusion here; see BUGS.md.
    let ideas = this.scanner.getIdeas();

    // Keep reference to full list for child priority lookup
    const allIdeasForChildLookup = ideas;

    // Filter out child items (they'll be rendered under their parent header)
    ideas = ideas.filter(idea => idea.parentLineNumber === undefined);

    // Apply tag filter if active (keeps headers whose children match)
    ideas = this.filterByActiveTag(ideas, allIdeasForChildLookup);

    // Sort by priority (focus first)
    // Pass full list for accurate child priority lookup
    ideas = this.sortTodosByPriority(ideas, allIdeasForChildLookup);

    const section = container.createEl("div", { cls: "ideas-section" });

    // Header carries the filter pill only — no title (the IDEAs tab name
    // already labels what's here).
    const header = section.createEl("div", { cls: "todo-section-header" });
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

  /**
   * Build the focus queue from current scanner data; respects continue-mode
   * and the active project/tag scope (PLAN.md's Phase 7) — scoping to a
   * project and opening Focus Mode only surfaces that project's items.
   */
  private rebuildFocusQueue(): void {
    const active = this.getActiveTodosForFocus();
    const inContinueMode = this.focusQueue?.inContinueMode === true;
    const result = buildFocusQueue(active, this.focusQueueLimit, {
      forceFallback: inContinueMode,
      tagFilter: this.activeTagFilter,
    });
    this.focusQueue = {
      items: result.items,
      source: result.source,
      inContinueMode,
    };
  }

  private renderFocusCard(container: HTMLElement): void {
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

      // Full project re-sync — only meaningful on the Projects tab. Mirrors
      // "Refresh" above but for repo-derived project data instead of the
      // vault's own #todo/#idea items, which "Refresh" already covers.
      if (this.activeTab === 'projects') {
        menu.addItem((item) => {
          item
            .setTitle("Sync")
            .setIcon("refresh-cw")
            .onClick(async () => {
              menuBtn.addClass("rotating");
              this.projectsSyncedOnce = false;
              await this.ensureProjectsSynced();
              setTimeout(() => menuBtn.removeClass("rotating"), 500);
            });
        });
      }

      menu.addSeparator();

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
          .onClick(() => this.onOpenSettings());
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

  /**
   * Switch to a normal tab (TODOs/Ideas), implicitly exiting focus mode
   * if it's active — one click, same as switching between any two
   * normal tabs. Unlike handleFocusExit (used by the eye icon and the
   * focus card's own "Exit" controls), this doesn't restore the previous
   * tab/scroll position: the user just explicitly picked a destination, so
   * there's nothing to restore.
   */
  private switchTab(tab: 'todos' | 'ideas'): void {
    if (this.focusModeActive) {
      this.focusModeActive = false;
      this.focusQueue = null;
      this.prevActiveTab = null;
      void this.setFocusModeActive(false);
    }
    this.activeTab = tab;
    this.render();
  }

  /**
   * Switch to the Projects tab. With no tag (the tab button itself), always
   * resets to the project list — even if already on this tab in detail
   * view, since that's the intended "back" affordance (see the tab
   * button's own click handler comment). With a tag (the "Show in
   * Projects" context-menu entries), jumps straight to that project's
   * detail view instead.
   */
  private switchToProjectsTab(tag?: string): void {
    if (this.focusModeActive) {
      this.focusModeActive = false;
      this.focusQueue = null;
      this.prevActiveTab = null;
      void this.setFocusModeActive(false);
    }
    this.activeTab = 'projects';
    void this.ensureProjectsSynced();
    if (tag) {
      void this.openProjectDetail(tag.replace(/^#/, ""));
    } else {
      this.projectsMode = 'list';
      this.activeProjectName = null;
      this.render();
    }
  }

  /**
   * Public entry point for main.ts — Settings' "Open Projects sidebar"
   * button and the "toggle-projects-sidebar" command, both of which need
   * to switch this view's tab from outside it (unlike the tab button and
   * the "Show in Projects" context-menu entries, which call
   * switchToProjectsTab directly since they're already inside this view).
   */
  openProjectsTab(tag?: string): void {
    this.switchToProjectsTab(tag);
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

    const current = this.focusQueue.items[0];

    // Build the FULL sorted candidate list (not bounded by focusQueueLimit) so
    // Skip always advances to the next candidate in main-list order, cycling
    // past the queue limit and across priority tiers. Wraps at the end so the
    // button stays responsive even after the user has walked the whole list.
    const allCandidates = this.buildFullFocusCandidateList();
    if (allCandidates.length < 2) return;

    const currentIdx = allCandidates.findIndex(
      t => t.filePath === current.filePath && t.lineNumber === current.lineNumber
    );
    const nextIdx = (Math.max(currentIdx, 0) + 1) % allCandidates.length;
    const nextItem = allCandidates[nextIdx];

    const card = this.containerEl.querySelector(".focus-card") as HTMLElement | null;
    if (card) {
      this.pendingFocusEnter = "skip";
      card.classList.add("focus-card--leaving-skip");
      await this.waitForAnimationEnd(card, 240);
    }

    this.focusQueue = {
      items: [nextItem],
      source: this.focusQueue.source,
      inContinueMode: this.focusQueue.inContinueMode,
    };
    this.render();
  }

  /**
   * The full ordered list of candidates Skip can walk through. Mirrors
   * `buildFocusQueue` but with no size cap so Skip can advance past the queue
   * limit and across priority tiers. The order matches the curated #focus or
   * priority-fallback comparator depending on the current queue source.
   */
  private buildFullFocusCandidateList(): TodoItem[] {
    const active = this.getActiveTodosForFocus();
    const result = buildFocusQueue(active, Number.MAX_SAFE_INTEGER, {
      forceFallback: this.focusQueue?.inContinueMode === true,
      tagFilter: this.activeTagFilter,
    });
    return result.items;
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
   * True when there's at least one focus candidate other than `current` in the
   * full sorted candidate list. Skip walks the full list, so this is the right
   * gate for enabling the button.
   */
  private hasMoreFocusCandidates(current: TodoItem | undefined): boolean {
    if (!current) return false;
    const all = this.buildFullFocusCandidateList();
    return all.some(
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

  // ===================================================================
  // Projects tab — list of detected git-repo projects, detail view per
  // project on selection. See ProjectsSidebarView.ts's file-level comment
  // for why this lives here instead of a second ItemView.
  // ===================================================================

  /** Full rescan + resync of every project. Runs once per session, lazily, the first time the Projects tab is opened; "Sync" in the kebab menu forces a repeat by clearing projectsSyncedOnce first. */
  private async ensureProjectsSynced(): Promise<void> {
    if (this.projectsSyncedOnce || this.projectsSyncing) return;
    const options = this.getProjectsOptions();
    if (!options.baseFolder) return;

    this.projectsSyncing = true;
    try {
      this.scannedProjects = await this.syncManager.syncAll({
        baseFolder: options.baseFolder,
        projectsFolder: options.projectsFolder,
        maxDepth: options.scanDepth,
        excludeDirs: options.excludeDirs,
      });
    } catch (error) {
      console.error("[Warped Todo]", "Project sync failed:", error);
      showNotice("Project sync failed. See console for details.");
    } finally {
      this.projectsSyncing = false;
      this.projectsSyncedOnce = true;
    }
    if (this.activeTab === 'projects') this.render();
  }

  /**
   * Applies scan results this view didn't itself request — from a
   * watch-triggered background sync, or the "Sync projects" command, both
   * of which call `syncManager.syncAll()` directly. Just stores; must NOT
   * call back into `syncAll()`, or wiring this to fire on every sync
   * completion would trigger another sync completion, forever (see
   * ProjectSyncManager's constructor doc comment for how this was found —
   * the same hazard applies here, not just to the old standalone view).
   * Only re-renders if the Projects tab is actually showing — a background
   * sync shouldn't yank a full re-render onto whatever tab the user's on.
   */
  applyProjectSyncResult(scanned: ScannedProject[]): void {
    this.scannedProjects = scanned;
    this.projectsSyncedOnce = true;
    if (this.activeTab === 'projects') this.render();
  }

  // ===== Sidebar/pane sync (auto-follow) =====

  private async handleProjectActiveFileChange(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    const currentPath = activeFile?.path ?? null;
    // Obsidian fires active-leaf-change/file-open often for reasons that
    // aren't "the user navigated somewhere new" (focus changes, layout
    // events). Only re-derive state when the active file itself actually
    // changed.
    if (currentPath === this.lastKnownProjectFilePath) return;
    this.lastKnownProjectFilePath = currentPath;

    const projectName = activeFile ? this.projectNameForNotePath(activeFile.path) : null;

    if (projectName) {
      if (this.projectsMode === 'detail' && this.activeProjectName === projectName) return;
      this.projectsMode = 'detail';
      this.activeProjectName = projectName;
    } else if (this.projectsMode === 'detail') {
      this.projectsMode = 'list';
      this.activeProjectName = null;
    } else {
      return;
    }
    if (this.activeTab === 'projects') this.render();
  }

  private projectNameForNotePath(filePath: string): string | null {
    const options = this.getProjectsOptions();
    for (const project of this.projectManager.getProjects(this.scannedProjects)) {
      if (!project.localPath) continue; // only repo-matched projects have a note worth auto-following
      const name = project.tag.replace(/^#/, "");
      if (projectFilePath(options.projectsFolder, name) === filePath) return name;
    }
    return null;
  }

  private async openProjectDetail(name: string): Promise<void> {
    const options = this.getProjectsOptions();
    const path = projectFilePath(options.projectsFolder, name);

    // Set state and render immediately — don't wait on the file-open round
    // trip first. Also records lastKnownProjectFilePath up front, so once
    // the resulting file-open event reaches handleProjectActiveFileChange,
    // it sees "nothing changed" and skips a second, redundant pass.
    this.lastKnownProjectFilePath = path;
    this.projectsMode = 'detail';
    this.activeProjectName = name;
    this.render();

    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  // ===== Rendering =====

  private renderProjectsTabContent(container: HTMLElement): void {
    if (this.projectsMode === 'detail' && this.activeProjectName) {
      this.renderProjectsDetail(container, this.activeProjectName);
    } else {
      this.renderProjectsList(container);
    }
  }

  private renderProjectsList(container: HTMLElement): void {
    const options = this.getProjectsOptions();

    if (!options.baseFolder) {
      const empty = container.createDiv({ cls: "warped-todo-projects-empty" });
      empty.createEl("p", { text: "No base folder configured yet." });
      const btn = empty.createEl("button", { text: "Open settings" });
      btn.addEventListener("click", () => this.onOpenSettings());
      return;
    }

    // The first switch to this tab triggers ensureProjectsSynced() in the
    // background (see switchToProjectsTab) and renders immediately rather
    // than waiting on it, so scannedProjects can still be empty here purely
    // because the sync hasn't finished — say so, rather than showing "No
    // projects found," which would read as a config problem instead of a
    // brief, normal wait.
    if (this.projectsSyncing && !this.projectsSyncedOnce) {
      container.createEl("p", { text: "Syncing projects…", cls: "warped-todo-projects-empty-msg" });
      return;
    }

    const filterInput = container.createEl("input", {
      type: "text",
      placeholder: "Filter…",
      cls: "warped-todo-projects-filter",
    }) as HTMLInputElement;
    filterInput.value = this.projectsFilterText;

    const listEl = container.createDiv({ cls: "warped-todo-projects-list" });
    filterInput.addEventListener("input", () => {
      this.projectsFilterText = filterInput.value;
      this.renderProjectRows(listEl);
    });

    this.renderProjectRows(listEl);
  }

  private renderProjectRows(listEl: HTMLElement): void {
    listEl.empty();
    const filterLower = this.projectsFilterText.toLowerCase();

    const projects = this.projectManager
      .getProjects(this.scannedProjects)
      .filter((p) => p.localPath) // list view is repo-matched projects only
      .filter((p) => !filterLower || p.tag.toLowerCase().includes(filterLower))
      .sort((a, b) => {
        const aActive = this.projectItemCounts(a).total > 0 ? 1 : 0;
        const bActive = this.projectItemCounts(b).total > 0 ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        return a.tag.localeCompare(b.tag);
      });

    if (projects.length === 0) {
      listEl.createEl("p", { text: "No projects found.", cls: "warped-todo-projects-empty-msg" });
      return;
    }

    for (const project of projects) this.renderProjectRow(listEl, project);
  }

  private projectItemCounts(project: ProjectInfo): { todo: number; idea: number; bug: number; total: number } {
    if (!project.localPath) return { todo: 0, idea: 0, bug: 0, total: 0 };
    const items = this.syncManager.getCachedItems(project.localPath).filter((i) => !i.completed);
    const counts = { todo: 0, idea: 0, bug: 0, total: 0 };
    for (const item of items) {
      counts[item.itemType]++;
      counts.total++;
    }
    return counts;
  }

  private renderProjectRow(listEl: HTMLElement, project: ProjectInfo): void {
    const name = project.tag.replace(/^#/, "");
    const row = this.renderProjectSummary(listEl, project);
    row.addClass("is-clickable");
    row.addEventListener("click", () => this.openProjectDetail(name));
  }

  /**
   * name/branch/status + item-count breakdown — the same block used both as
   * a clickable row in the list view and, unclickable, as the framing header
   * atop the detail view. Sharing this one renderer is the point: the
   * detail view's top should look like the list row you just clicked, not
   * introduce a second, differently-styled summary of the same three facts.
   */
  private renderProjectSummary(container: HTMLElement, project: ProjectInfo): HTMLElement {
    const name = project.tag.replace(/^#/, "");
    const counts = this.projectItemCounts(project);
    const row = container.createDiv({ cls: "warped-todo-project-row" });

    const titleLine = row.createDiv({ cls: "warped-todo-project-row-title" });
    titleLine.createSpan({ text: name, cls: "warped-todo-project-name" });

    // Filename + arrow to the project's own note — the same "which file is
    // this?" affordance TODOs' header/orphan-section rows give their source
    // file. Reported missing here via screenshot comparison. Omitted (not
    // guessed) if the note hasn't been synced into the vault yet.
    // stopPropagation matters in the list view, where the row itself is
    // also clickable (opens detail mode) — otherwise this arrow's click
    // would bubble up and trigger that too, on top of opening the file.
    const notePath = projectFilePath(this.getProjectsOptions().projectsFolder, name);
    const noteFile = this.app.vault.getAbstractFileByPath(notePath);
    if (noteFile instanceof TFile) {
      titleLine.createSpan({
        cls: "header-filename",
        text: noteFile.name,
        attr: { title: noteFile.path },
      });
      const link = titleLine.createEl("a", {
        cls: "todo-orphan-section-link",
        text: "→",
        href: "#",
        attr: { "aria-label": `Open ${noteFile.path}` },
      });
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        openFileAtLine(this.app, noteFile, 0);
      });
    }

    // Branch, git status, and item counts share one muted line below the
    // name, dot-separated like the counts already were — branch used to
    // sit on the title line instead, which wrapped badly for long project
    // names and put it on a different line than everything else describing
    // the repo's current state. Reported via screenshot. Each chunk keeps
    // its own class (status keeps its accent colour/monospace) rather than
    // joining into one plain string, the way counts alone used to.
    const metaChunks: { text: string; cls?: string }[] = [];
    if (project.branch) metaChunks.push({ text: project.branch, cls: "warped-todo-project-branch" });
    if (project.gitStatus) metaChunks.push({ text: project.gitStatus, cls: "warped-todo-project-status" });
    if (counts.total > 0) {
      const parts: string[] = [];
      if (counts.todo > 0) parts.push(`${counts.todo} todo`);
      if (counts.idea > 0) parts.push(`${counts.idea} idea`);
      if (counts.bug > 0) parts.push(`${counts.bug} bug`);
      metaChunks.push({ text: parts.join(" · ") });
    }
    if (metaChunks.length > 0) {
      const metaLine = row.createDiv({ cls: "warped-todo-project-row-meta" });
      metaChunks.forEach((chunk, i) => {
        if (i > 0) metaLine.createSpan({ text: " · " });
        metaLine.createSpan({ text: chunk.text, cls: chunk.cls });
      });
    }
    return row;
  }

  // ===== Detail view =====

  private renderProjectsDetail(container: HTMLElement, name: string): void {
    const projects = this.projectManager.getProjects(this.scannedProjects);
    const project = projects.find((p) => p.tag.replace(/^#/, "") === name);

    if (!project || !project.localPath) {
      container.createEl("p", { text: `"${name}" is no longer a detected project.` });
      return;
    }

    const info = container.createDiv({ cls: "warped-todo-project-info" });
    this.renderProjectSummary(info, project);

    const actions = info.createDiv({ cls: "warped-todo-project-info-actions" });
    if (project.remote) {
      const url = browsableUrl(project.remote);
      const link = actions.createEl("a", {
        cls: "warped-todo-project-info-action",
        href: url,
        attr: { title: url },
      });
      setIcon(link.createSpan(), "external-link");
      link.createSpan({ text: url.replace(/^https?:\/\//, "") });
      link.setAttr("target", "_blank");
    }
    const revealBtn = actions.createEl("a", {
      cls: "warped-todo-project-info-action",
      attr: { title: project.localPath },
    });
    setIcon(revealBtn.createSpan(), "folder-open");
    revealBtn.createSpan({ text: homeRelativePath(project.localPath) });
    revealBtn.addEventListener("click", () => this.revealProjectInFinder(project.localPath!));

    const itemsContainer = container.createDiv({ cls: "warped-todo-project-items" });
    this.renderProjectItemGroups(itemsContainer, project);
  }

  private revealProjectInFinder(path: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const electron = require("electron");
      const shell = electron.remote?.shell ?? electron.shell;
      shell.showItemInFolder(path);
    } catch (error) {
      console.error("[Warped Todo]", "Failed to reveal folder:", error);
      showNotice("Couldn't open Finder. See console for details.");
    }
  }

  /** Opens a synced item's source file (a plain filesystem path, not necessarily inside the vault) in the OS default editor — the external-file equivalent of openFileAtLine for a vault TFile. */
  private openExternalProjectFile(path: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const electron = require("electron");
      const shell = electron.remote?.shell ?? electron.shell;
      shell.openPath(path);
    } catch (error) {
      console.error("[Warped Todo]", "Failed to open file:", error);
      showNotice("Couldn't open file. See console for details.");
    }
  }

  /**
   * Two sources, concatenated — see DESIGN.md's "Item list — two sources, no
   * reverse-mapping": synced items come from `syncManager.getCachedItems()`
   * (parsed straight from each repo's BUGS.md/TODO.md/etc., not from the
   * vault note); hand-typed items come from a normal TodoScanner vault scan
   * of this same note.
   *
   * Group headings and item rows reuse the TODOs tab's own CSS classes
   * (`.todo-orphan-section*`, `.todo-checkbox*`, `.todo-text`) rather than
   * parallel ones, so this view is styled identically by construction.
   */
  private renderProjectItemGroups(container: HTMLElement, project: ProjectInfo): void {
    const name = project.tag.replace(/^#/, "");
    const syncedItems = this.syncManager.getCachedItems(project.localPath!);

    for (const group of GROUP_ORDER) {
      const groupItems = syncedItems.filter((i) => i.itemType === group.type);
      if (groupItems.length === 0) continue;
      const groupEl = container.createDiv({ cls: "warped-todo-project-item-group" });
      this.renderProjectGroupHeading(groupEl, group.heading, this.syncedProjectGroupFileHint(groupItems));
      for (const item of groupItems) {
        this.renderSyncedProjectItemRow(groupEl, item, name, group.checkbox, project.localPath!);
      }
    }

    const handTypedGroups = this.buildHandTypedProjectGroups(name);
    for (const group of handTypedGroups) {
      const groupEl = container.createDiv({ cls: "warped-todo-project-item-group" });
      this.renderProjectGroupHeading(groupEl, group.label, {
        displayName: group.file.name,
        path: group.file.path,
        onOpen: () => openFileAtLine(this.app, group.file, group.lineNumber),
      });
      for (const item of group.items) this.renderHandTypedProjectItemRow(groupEl, item);
    }

    if (syncedItems.length === 0 && handTypedGroups.length === 0) {
      container.createEl("p", { text: "No tracked items.", cls: "warped-todo-projects-empty-msg" });
    }
  }

  /**
   * A group's file hint, when every item in it came from the same source
   * file (the common case — one BUGS.md or TODO.md per repo). Omitted, not
   * guessed, when a group spans more than one file.
   */
  private syncedProjectGroupFileHint(items: ParsedProjectItem[]): GroupFileHint | undefined {
    const paths = new Set(items.map((i) => i.sourceFile));
    if (paths.size !== 1) return undefined;
    const path = items[0].sourceFile;
    return {
      displayName: path.split("/").pop() ?? path,
      path,
      onOpen: () => this.openExternalProjectFile(path),
    };
  }

  /**
   * `fileHint` supplies the visible filename + click-through arrow — same
   * affordance a header-with-children row gets on the TODOs tab
   * (`.header-filename` + `→`).
   */
  private renderProjectGroupHeading(groupEl: HTMLElement, label: string, fileHint?: GroupFileHint): void {
    const heading = groupEl.createDiv({ cls: "todo-orphan-section" });
    heading.createSpan({ cls: "todo-orphan-section-text", text: label });
    if (!fileHint) return;
    heading.createSpan({
      cls: "header-filename",
      text: fileHint.displayName,
      attr: { title: fileHint.path },
    });
    const link = heading.createEl("a", {
      cls: "todo-orphan-section-link",
      text: "→",
      href: "#",
      attr: { "aria-label": `Open ${fileHint.path}` },
    });
    link.addEventListener("click", (evt) => {
      evt.preventDefault();
      fileHint.onOpen();
    });
  }

  /**
   * Groups hand-typed items the same way the TODOs tab itself does: a
   * header TODO's children belong under it, true orphans (no parent header)
   * group by `sectionLabel`.
   */
  private buildHandTypedProjectGroups(projectName: string): HandTypedGroup[] {
    return groupHandTypedItems(this.handTypedProjectItems(projectName));
  }

  /** Vault-scanned #todo/#idea items hand-typed into this note (the whole note — there's no sync-owned region to exclude). */
  private handTypedProjectItems(projectName: string): TodoItem[] {
    const options = this.getProjectsOptions();
    const notePath = projectFilePath(options.projectsFolder, projectName);
    return [...this.scanner.getTodos(), ...this.scanner.getIdeas()].filter(
      (t) => t.filePath === notePath
    );
  }

  private renderSyncedProjectItemRow(
    container: HTMLElement,
    item: ParsedProjectItem,
    projectName: string,
    checkbox: boolean,
    repoPath: string
  ): void {
    const row = container.createDiv({ cls: "warped-todo-project-item-row todo-item" });
    if (checkbox) {
      const wrap = row.createDiv({ cls: "todo-checkbox-wrap" });
      const cb = wrap.createEl("input", { type: "checkbox", cls: "todo-checkbox" }) as HTMLInputElement;
      cb.checked = item.completed;
      cb.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        // headerNested (Phase 6 Case 1) needs repoPath/scanner for its git-clean
        // safety check; harmless to pass for other shapes, which ignore it.
        const ok = await setProjectItemCompletion(item, !item.completed, {
          repoPath,
          scanner: this.projectScanner,
        });
        if (ok) await this.resyncActiveProject();
      });
    }
    row.createSpan({ text: cleanDisplayText(item.text), cls: "todo-text" });
    row.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.showSyncedProjectItemMenu(evt, item);
    });
  }

  private renderHandTypedProjectItemRow(container: HTMLElement, item: TodoItem): void {
    const row = container.createDiv({ cls: "warped-todo-project-item-row todo-item" });
    if (item.hasCheckbox) {
      const wrap = row.createDiv({ cls: "todo-checkbox-wrap" });
      const cb = wrap.createEl("input", { type: "checkbox", cls: "todo-checkbox" }) as HTMLInputElement;
      cb.checked = false; // getTodos() only returns active items — never pre-checked
      cb.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        const ok = await this.processor.completeTodo(item, this.getProjectsOptions().defaultTodoneFile);
        if (ok) this.render();
      });
    }
    row.createSpan({ text: cleanDisplayText(item.text), cls: "todo-text" });
    row.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.contextMenuHandler.showTodoMenu(evt, item, () => this.render(), false);
    });
  }

  private showSyncedProjectItemMenu(evt: MouseEvent, item: ParsedProjectItem): void {
    const menu = new Menu();
    const hasFocus = item.tags.includes("#focus");
    const hasFuture = item.tags.includes("#future");
    const currentPriority = item.tags.find((t) => /^#p[0-4]$/.test(t)) ?? null;
    const hasLaterPriority = currentPriority !== null && /^#p[3-4]$/.test(currentPriority);

    menu.addItem((mi) => {
      mi.setTitle("Copy").setIcon("copy").onClick(async () => {
        await navigator.clipboard.writeText(item.text);
      });
    });

    menu.addItem((mi) => {
      mi.setTitle(hasFocus ? "Unfocus" : "Focus")
        .setIcon("zap")
        .onClick(async () => {
          const ok = hasFocus
            ? await removeProjectItemTag(item, "#focus")
            : await setProjectItemPriority(item, calculateProjectFocusPriority(currentPriority), true);
          if (ok) await this.resyncActiveProject();
        });
    });

    menu.addItem((mi) => {
      mi.setTitle(hasLaterPriority ? "Unlater" : "Later")
        .setIcon("clock")
        .onClick(async () => {
          const ok = hasLaterPriority
            ? await removeProjectItemTag(item, currentPriority!)
            : await setProjectItemPriority(item, calculateProjectLaterPriority(currentPriority));
          if (ok) await this.resyncActiveProject();
        });
    });

    menu.addItem((mi) => {
      mi.setTitle(hasFuture ? "Unsnooze" : "Snooze")
        .setIcon("moon")
        .onClick(async () => {
          const ok = hasFuture
            ? await removeProjectItemTag(item, "#future")
            : await addProjectItemTag(item, "#future");
          if (ok) await this.resyncActiveProject();
        });
    });

    menu.showAtMouseEvent(evt);
  }

  /**
   * Re-reads the active project's structured files after a mutation and
   * updates this view's item cache directly, so the change is visible
   * immediately without a vault write — items live only in the sidebar's
   * cache now, not in the note body.
   */
  private async resyncActiveProject(): Promise<void> {
    if (!this.activeProjectName) return;
    const scanned = this.scannedProjects.find((p) => p.name === this.activeProjectName);
    if (!scanned) return;

    const items = await this.syncManager.getProjectItems(scanned.localPath);
    this.syncManager.updateCachedItems(scanned.localPath, items);

    this.render();
  }

}
