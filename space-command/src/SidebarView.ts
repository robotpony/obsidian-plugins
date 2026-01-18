import { ItemView, WorkspaceLeaf, TFile, Menu, Notice, Modal } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { TodoProcessor } from "./TodoProcessor";
import { ProjectManager } from "./ProjectManager";
import { TodoItem, ProjectInfo, ItemRenderConfig } from "./types";
import { ContextMenuHandler } from "./ContextMenuHandler";
import { getPriorityValue, LOGO_PREFIX, renderTextWithTags, openFileAtLine } from "./utils";

export const VIEW_TYPE_TODO_SIDEBAR = "space-command-sidebar";

export class TodoSidebarView extends ItemView {
  private scanner: TodoScanner;
  private processor: TodoProcessor;
  private projectManager: ProjectManager;
  private defaultTodoneFile: string;
  private updateListener: (() => void) | null = null;
  private contextMenuHandler: ContextMenuHandler;
  private recentTodonesLimit: number;
  private activeTab: 'todos' | 'ideas' = 'todos';

  constructor(
    leaf: WorkspaceLeaf,
    scanner: TodoScanner,
    processor: TodoProcessor,
    projectManager: ProjectManager,
    defaultTodoneFile: string,
    priorityTags: string[],
    recentTodonesLimit: number
  ) {
    super(leaf);
    this.scanner = scanner;
    this.processor = processor;
    this.projectManager = projectManager;
    this.defaultTodoneFile = defaultTodoneFile;
    this.recentTodonesLimit = recentTodonesLimit;

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
    return "⌥⌘ TODOs";
  }

  getIcon(): string {
    return "checkbox-glyph";
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
    // Remove inline code
    cleaned = cleaned.replace(/`(.+?)`/g, "$1");
    // Remove links but keep the text
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
    return cleaned;
  }

  // Configuration for unified list item rendering
  private readonly todoConfig: ItemRenderConfig = {
    type: 'todo',
    classPrefix: 'todo',
    tagToStrip: /#todo\b/g,
    showCheckbox: true,
    onComplete: (item) => this.processor.completeTodo(item, this.defaultTodoneFile),
    onContextMenu: (e, item) => this.contextMenuHandler.showTodoMenu(e, item, () => this.render())
  };

  private readonly ideaConfig: ItemRenderConfig = {
    type: 'idea',
    classPrefix: 'idea',
    tagToStrip: /#idea\b/g,
    showCheckbox: true,
    onComplete: (item) => this.processor.completeIdea(item),
    onContextMenu: (e, item) => this.contextMenuHandler.showIdeaMenu(e, item, () => this.render())
  };

  private readonly principleConfig: ItemRenderConfig = {
    type: 'principle',
    classPrefix: 'principle',
    tagToStrip: /#principle\b/g,
    showCheckbox: false
  };


  // Unified list item renderer for todos, ideas, and principles
  private renderListItem(
    list: HTMLElement,
    item: TodoItem,
    config: ItemRenderConfig,
    isChild: boolean = false
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

    // Text content (strip type tag but keep other tags)
    const textSpan = rowContainer.createEl("span", { cls: `${config.classPrefix}-text` });
    const cleanText = item.text.replace(config.tagToStrip, "").trim();
    const displayText = this.stripMarkdownSyntax(cleanText);
    renderTextWithTags(displayText, textSpan);

    // For headers with children, append count inline with text
    if (hasChildren) {
      const childCount = item.childLineNumbers!.length;
      textSpan.createEl("span", { cls: `${config.classPrefix}-count`, text: ` ${childCount}` });
    }
    textSpan.appendText(" ");

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
      for (const childLine of item.childLineNumbers!) {
        const childItem = allItems.find(
          t => t.filePath === item.filePath && t.lineNumber === childLine
        );
        if (childItem) {
          this.renderListItem(childrenContainer, childItem, config, true);
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
    titleEl.createEl("span", { cls: "space-command-logo", text: "⌥⌘" });
    titleEl.appendText(" Space Command");

    // Tab navigation
    const tabNav = headerDiv.createEl("div", { cls: "sidebar-tab-nav" });

    const todosTab = tabNav.createEl("button", {
      cls: `sidebar-tab-btn ${this.activeTab === 'todos' ? 'active' : ''}`,
      attr: { "aria-label": "TODOs" },
    });
    todosTab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
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

      // Copy embed syntax submenu
      menu.addItem((item) => {
        item
          .setTitle("Copy embed syntax")
          .setIcon("copy");

        const submenu = (item as any).setSubmenu();
        submenu.addItem((subItem: any) => {
          subItem
            .setTitle("Inline syntax")
            .setIcon("brackets")
            .onClick(() => {
              navigator.clipboard.writeText("{{focus-todos}}");
              new Notice(`${LOGO_PREFIX} Copied inline embed syntax`);
            });
        });
        submenu.addItem((subItem: any) => {
          subItem
            .setTitle("Code block syntax")
            .setIcon("code")
            .onClick(() => {
              navigator.clipboard.writeText("```focus-todos\n```");
              new Notice(`${LOGO_PREFIX} Copied code block embed syntax`);
            });
        });
      });

      menu.addSeparator();

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

      menu.showAtMouseEvent(evt);
    });

    // Render content based on active tab
    if (this.activeTab === 'todos') {
      this.renderTodosContent(container);
    } else {
      this.renderIdeasContent(container);
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
    return [...todos].sort((a, b) => {
      const priorityDiff = getPriorityValue(a.tags) - getPriorityValue(b.tags);
      if (priorityDiff !== 0) return priorityDiff;
      // If same priority, sort by date created
      return a.dateCreated - b.dateCreated;
    });
  }

  private renderProjects(container: HTMLElement): void {
    const projects = this.projectManager.getProjects();

    const section = container.createEl("div", { cls: "projects-section" });

    const header = section.createEl("div", {
      cls: "todo-section-header projects-header",
    });

    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "Focus";

    if (projects.length === 0) {
      section.createEl("div", {
        text: "No focus projects yet",
        cls: "todo-empty",
      });
      return;
    }

    // Sort projects by priority, then by count
    projects.sort((a, b) => {
      const priorityDiff = a.highestPriority - b.highestPriority;
      if (priorityDiff !== 0) return priorityDiff;
      // If same priority, sort by count (higher count first)
      return b.count - a.count;
    });

    const list = section.createEl("ul", { cls: "project-list" });

    for (const project of projects) {
      this.renderProjectItem(list, project);
    }
  }

  private renderProjectItem(list: HTMLElement, project: ProjectInfo): void {
    // Check if this project has any #focus items (priority 0 = #focus)
    const hasFocusItems = project.highestPriority === 0;
    const item = list.createEl("li", { cls: `project-item${hasFocusItems ? ' project-focus' : ''}` });

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

  private renderActiveTodos(container: HTMLElement): void {
    let todos = this.scanner.getTodos();

    // Filter out #future (snoozed) TODOs
    todos = todos.filter(todo => !todo.tags.includes("#future"));

    // Filter out child items (they'll be rendered under their parent header)
    todos = todos.filter(todo => todo.parentLineNumber === undefined);

    // Sort by priority
    todos = this.sortTodosByPriority(todos);

    const section = container.createEl("div", { cls: "todo-section" });

    const header = section.createEl("div", { cls: "todo-section-header" });
    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "TODO";

    if (todos.length === 0) {
      section.createEl("div", {
        text: "No TODOs",
        cls: "todo-empty",
      });
      return;
    }

    const list = section.createEl("ul", { cls: "todo-list" });

    for (const todo of todos) {
      this.renderTodoItem(list, todo);
    }
  }

  private renderTodoItem(list: HTMLElement, todo: TodoItem, isChild: boolean = false): void {
    this.renderListItem(list, todo, this.todoConfig, isChild);
  }

  private renderRecentTodones(container: HTMLElement): void {
    const allTodones = this.scanner.getTodones(100); // Get more than we need
    const todones = allTodones.slice(0, this.recentTodonesLimit); // Limit display

    const section = container.createEl("div", { cls: "todone-section" });

    const header = section.createEl("div", {
      cls: "todo-section-header todone-header",
    });

    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "DONE";

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
      section.createEl("div", {
        text: "No completed TODOs",
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

    // Text content (strip markdown but keep tags)
    const textSpan = item.createEl("span", { cls: "todo-text todone-text" });
    const cleanText = todone.text.replace(/#todone\b/g, "").trim();
    const displayText = this.stripMarkdownSyntax(cleanText);
    renderTextWithTags(displayText, textSpan);
    textSpan.appendText(" ");

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

    const section = container.createEl("div", { cls: "principles-section" });

    const header = section.createEl("div", {
      cls: "todo-section-header principles-header",
    });

    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "Principles";

    if (principles.length === 0) {
      section.createEl("div", {
        text: "No principles yet",
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

    // Sort by priority (focus first)
    ideas = this.sortTodosByPriority(ideas);

    const section = container.createEl("div", { cls: "ideas-section" });

    const header = section.createEl("div", { cls: "todo-section-header" });
    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.textContent = "Ideas";

    if (ideas.length === 0) {
      section.createEl("div", {
        text: "No ideas yet",
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
      new Notice(
        `${LOGO_PREFIX} Completed ${completed} TODO(s), ${failed} failed. See console for details.`
      );
    } else {
      new Notice(`${LOGO_PREFIX} Completed all ${completed} TODO(s) for ${project.tag}!`);
    }
    // Note: sidebar will auto-refresh via todos-updated event after scanner rescans
  }

}
