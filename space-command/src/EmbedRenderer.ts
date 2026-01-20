import { App, TFile } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { TodoProcessor } from "./TodoProcessor";
import { ProjectManager } from "./ProjectManager";
import { FilterParser } from "./FilterParser";
import { ContextMenuHandler } from "./ContextMenuHandler";
import { TodoItem } from "./types";
import { getPriorityValue, renderTextWithTags, openFileAtLine } from "./utils";

export class EmbedRenderer {
  private app: App;
  private scanner: TodoScanner;
  private processor: TodoProcessor;
  private projectManager: ProjectManager;
  private contextMenuHandler: ContextMenuHandler;
  private defaultTodoneFile: string;
  private focusListLimit: number;
  private priorityTags: string[];

  // Track active renders for event cleanup
  private activeRenders: Map<HTMLElement, () => void> = new Map();

  // Track TODONE visibility state per container
  private todoneVisibility: Map<HTMLElement, boolean> = new Map();

  constructor(
    app: App,
    scanner: TodoScanner,
    processor: TodoProcessor,
    projectManager: ProjectManager,
    defaultTodoneFile: string = "todos/done.md",
    focusListLimit: number = 5,
    priorityTags: string[] = ["#p0", "#p1", "#p2", "#p3", "#p4"]
  ) {
    this.app = app;
    this.scanner = scanner;
    this.processor = processor;
    this.projectManager = projectManager;
    this.defaultTodoneFile = defaultTodoneFile;
    this.focusListLimit = focusListLimit;
    this.priorityTags = priorityTags;
    this.contextMenuHandler = new ContextMenuHandler(app, processor, priorityTags);
  }

  // Cleanup method to remove event listeners for a specific container
  public cleanup(container: HTMLElement): void {
    const listener = this.activeRenders.get(container);
    if (listener) {
      this.scanner.off("todos-updated", listener);
      this.activeRenders.delete(container);
    }
    // Clean up visibility state
    this.todoneVisibility.delete(container);
  }

  // Cleanup all renders (called on plugin unload)
  public cleanupAll(): void {
    for (const [, listener] of this.activeRenders) {
      this.scanner.off("todos-updated", listener);
    }
    this.activeRenders.clear();
  }

  // Public helper method for code block processor
  // Renders a TODO list with filters (includes both TODOs and TODONEs)
  public renderTodos(
    container: HTMLElement,
    filterString: string,
    todoneFile: string
  ): void {
    const filters = FilterParser.parse(filterString);
    // Get both active TODOs and completed TODONEs
    const allTodos = this.scanner.getTodos();
    const allTodones = this.scanner.getTodones();
    // Keep unfiltered list for child lookup
    const unfiltered = [...allTodos, ...allTodones];
    // Apply filters to both
    const filteredTodos = FilterParser.applyFilters(allTodos, filters);
    const filteredTodones = FilterParser.applyFilters(allTodones, filters);
    // Combine them - sortTodos will separate and sort them properly
    const combined = [...filteredTodos, ...filteredTodones];
    this.renderTodoList(container, combined, todoneFile, filterString, unfiltered);
  }

  // Public helper method for focus-list code blocks
  public renderProjects(container: HTMLElement): void {
    this.renderFocusList(container);
  }

  // Public helper method for focus-ideas code blocks
  public renderIdeas(
    container: HTMLElement,
    filterString: string
  ): void {
    const filters = FilterParser.parse(filterString);
    const allIdeas = this.scanner.getIdeas();
    const filteredIdeas = FilterParser.applyFilters(allIdeas, filters);
    this.renderIdeaList(container, filteredIdeas, filterString, allIdeas);
  }

  // Public helper method for focus-principles code blocks
  public renderPrinciples(
    container: HTMLElement,
    filterString: string
  ): void {
    const filters = FilterParser.parse(filterString);
    const allPrinciples = this.scanner.getPrinciples();
    const filteredPrinciples = FilterParser.applyFilters(allPrinciples, filters);
    this.renderPrincipleList(container, filteredPrinciples, filterString, allPrinciples);
  }

  async render(source: string, el: HTMLElement): Promise<void> {
    // Check if this is a focus-list embed
    const focusListMatch = source.match(/\{\{focus-list\}\}/);
    if (focusListMatch) {
      this.renderFocusList(el);
      return;
    }

    // Parse the embed syntax: {{focus-todos: [todone-file] | [filters]}}
    // Supports: {{focus-todos}}, {{focus-todos | filters}}, {{focus-todos: file | filters}}
    // Both todone-file and filters are optional
    const match = source.match(
      /\{\{focus-todos:?\s*([^|}]*)(?:\s*\|\s*(.+))?\}\}/
    );

    if (!match) {
      el.createEl("div", {
        text: "Invalid syntax (use {{focus-todos}} or {{focus-list}})",
        cls: "space-command-error",
      });
      return;
    }

    // Extract parts
    const beforePipe = match[1]?.trim() || "";
    const afterPipe = match[2] || "";

    // Determine if beforePipe is a filter or file path
    // If it contains filter keywords, treat as filters
    const isFilter =
      beforePipe.startsWith("path:") ||
      beforePipe.startsWith("tags:") ||
      beforePipe.startsWith("limit:");

    let todoneFile: string;
    let filterString: string;

    if (isFilter) {
      // beforePipe is filters, use default file
      todoneFile = this.defaultTodoneFile;
      filterString = beforePipe + (afterPipe ? " " + afterPipe : "");
    } else {
      // beforePipe is file path (or empty)
      todoneFile = beforePipe || this.defaultTodoneFile;
      filterString = afterPipe;
    }

    // Parse filters
    const filters = FilterParser.parse(filterString);

    // Get both TODOs and TODONEs
    const allTodos = this.scanner.getTodos();
    const allTodones = this.scanner.getTodones();
    // Keep unfiltered list for child lookup
    const unfiltered = [...allTodos, ...allTodones];
    // Apply filters
    const filteredTodos = FilterParser.applyFilters(allTodos, filters);
    const filteredTodones = FilterParser.applyFilters(allTodones, filters);
    const combined = [...filteredTodos, ...filteredTodones];

    // Render the todo list
    this.renderTodoList(el, combined, todoneFile, filterString, unfiltered);
  }

  private renderFocusList(container: HTMLElement): void {
    container.empty();
    container.addClass("space-command-embed", "focus-list-embed");

    // Add header with refresh button
    const header = container.createEl("div", { cls: "embed-header" });

    const refreshBtn = header.createEl("button", {
      cls: "clickable-icon embed-refresh-btn",
      attr: { "aria-label": "Refresh" },
    });
    refreshBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>';

    refreshBtn.addEventListener("click", () => {
      this.renderFocusList(container);
    });

    // Setup auto-refresh
    this.setupFocusListAutoRefresh(container);

    const projects = this.projectManager.getFocusProjects(this.focusListLimit);

    if (projects.length === 0) {
      container.createEl("div", {
        text: "No focus projects",
        cls: "space-command-empty",
      });
      return;
    }

    const list = container.createEl("ul", { cls: "focus-list" });

    for (const project of projects) {
      const item = list.createEl("li", { cls: "focus-list-item" });

      // Project tag
      const textSpan = item.createEl("span", { cls: "focus-project-text" });
      textSpan.textContent = `${project.tag} `;

      // Link to project file
      const link = item.createEl("a", {
        text: "→",
        cls: "focus-project-link",
        href: "#",
      });

      link.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.projectManager.openProjectFile(project.tag);
      });
    }
  }

  private getFirstProjectTag(todo: TodoItem): string {
    // Return first non-priority tag for alphabetical sorting
    const excludeTags = ['#focus', '#future', '#p0', '#p1', '#p2', '#p3', '#p4', '#todo', '#todone'];
    const projectTag = todo.tags.find(t => !excludeTags.includes(t));
    return projectTag || 'zzz'; // Sort items without project tags to end
  }

  private sortTodos(todos: TodoItem[]): TodoItem[] {
    // Separate active TODOs and completed TODONEs
    const activeTodos = todos.filter(t => t.tags.includes("#todo"));
    const completedTodones = todos.filter(t => t.tags.includes("#todone"));

    // Sort active TODOs by priority, then by project tag alphabetically
    activeTodos.sort((a, b) => {
      const priorityDiff = getPriorityValue(a.tags) - getPriorityValue(b.tags);
      if (priorityDiff !== 0) return priorityDiff;
      // Same priority: sort by first project tag alphabetically
      return this.getFirstProjectTag(a).localeCompare(this.getFirstProjectTag(b));
    });

    // Append completed TODONEs at the end (unsorted)
    return [...activeTodos, ...completedTodones];
  }

  private extractCompletionDate(text: string): string | null {
    // Match @YYYY-MM-DD pattern
    const match = text.match(/@(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  private renderTodoList(
    container: HTMLElement,
    todos: TodoItem[],
    todoneFile: string,
    filterString: string = "",
    unfilteredTodos?: TodoItem[]
  ): void {
    container.empty();
    container.addClass("space-command-embed");

    // Parse filters to get initial todone visibility
    const filters = FilterParser.parse(filterString);
    // Get visibility: check stored state first, then filter setting, default to show
    const showTodones = this.todoneVisibility.get(container) ??
                        (filters.todone !== 'hide');

    // Store current state
    this.todoneVisibility.set(container, showTodones);

    // Add header with buttons
    const header = container.createEl("div", { cls: "embed-header" });

    // Add TODONE toggle button
    const toggleBtn = header.createEl("button", {
      cls: `clickable-icon embed-toggle-todone-btn${showTodones ? ' active' : ''}`,
      attr: { "aria-label": showTodones ? "Hide completed" : "Show completed" },
    });
    // Eye icon when showing, eye-off when hiding
    toggleBtn.innerHTML = showTodones
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    toggleBtn.addEventListener("click", () => {
      this.todoneVisibility.set(container, !showTodones);
      this.refreshEmbed(container, todoneFile, filterString);
    });

    const refreshBtn = header.createEl("button", {
      cls: "clickable-icon embed-refresh-btn",
      attr: { "aria-label": "Refresh" },
    });
    refreshBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>';

    refreshBtn.addEventListener("click", () => {
      this.refreshEmbed(container, todoneFile, filterString);
    });

    // Set up auto-refresh listener
    this.setupAutoRefresh(container, todoneFile, filterString);

    // Filter todos for display based on visibility setting
    let displayTodos = todos;
    if (!showTodones) {
      displayTodos = todos.filter(t => !t.tags.includes("#todone"));
    }

    if (displayTodos.length === 0) {
      container.createEl("div", {
        text: showTodones ? "No TODOs" : "No active TODOs",
        cls: "space-command-empty",
      });
      return;
    }

    // Filter out child items (they'll be rendered under their parent header)
    const topLevelTodos = displayTodos.filter(t => t.parentLineNumber === undefined);

    // Sort todos: active by priority/project, completed at end
    const sortedTodos = this.sortTodos(topLevelTodos);

    const list = container.createEl("ul", { cls: "contains-task-list" });

    // Use unfiltered todos for child lookup (so children without filter tags are still found)
    const allTodosForLookup = unfilteredTodos || todos;

    for (const todo of sortedTodos) {
      // Pass unfiltered todos array for child lookup, and showTodones for visibility
      this.renderTodoItem(list, todo, allTodosForLookup, showTodones, todoneFile, filterString);
    }
  }

  // Render a single todo item (and its children if it's a header)
  private renderTodoItem(
    list: HTMLElement,
    todo: TodoItem,
    allTodos: TodoItem[],
    showTodones: boolean,
    todoneFile: string,
    filterString: string,
    isChild: boolean = false
  ): void {
    const isCompleted = todo.tags.includes("#todone");
    const isHeader = todo.isHeader === true;
    const hasChildren = isHeader && todo.childLineNumbers && todo.childLineNumbers.length > 0;

    const itemClasses = [
      'task-list-item',
      isCompleted ? 'todone-item' : '',
      isHeader ? 'todo-header' : '',
      isChild ? 'todo-child' : '',
      hasChildren ? 'todo-header-with-children' : ''
    ].filter(c => c).join(' ');

    const item = list.createEl("li", { cls: itemClasses });

    // For headers with children, create a row container for the header content
    // This allows children to appear below (block layout) while header stays flex
    const rowContainer = hasChildren
      ? item.createEl("div", { cls: "todo-header-row" })
      : item;

    // Add right-click context menu for active TODOs
    if (!isCompleted) {
      item.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.contextMenuHandler.showTodoMenu(e, todo, () => {
          // Re-render the entire embed after priority change
          this.refreshEmbed(list.closest('.space-command-embed') as HTMLElement, todoneFile, filterString);
        });
      });
    }

    // Create checkbox
    const checkbox = rowContainer.createEl("input", {
      type: "checkbox",
      cls: "task-list-item-checkbox",
    });

    if (isCompleted) {
      checkbox.checked = true;
      checkbox.disabled = true;
    }

    checkbox.addEventListener("change", async () => {
      if (isCompleted) return;
      checkbox.disabled = true;
      const success = await this.processor.completeTodo(todo, todoneFile);
      if (success) {
        // Refresh the entire embed
        const container = list.closest('.space-command-embed') as HTMLElement;
        if (container) {
          this.refreshEmbed(container, todoneFile, filterString);
        }
      } else {
        checkbox.disabled = false;
      }
    });

    // Add todo text (without the #todo/#todone tag)
    const textSpan = rowContainer.createEl("span", { cls: "todo-text" });
    if (isCompleted) {
      textSpan.addClass("todone-text");
    }
    let cleanText = todo.text.replace(/#todos?\b/g, "").replace(/#todones?\b/g, "").trim();
    // Remove completion date from display text (we'll show it separately)
    const completionDate = isCompleted ? this.extractCompletionDate(cleanText) : null;
    if (completionDate) {
      cleanText = cleanText.replace(/@\d{4}-\d{2}-\d{2}/, "").trim();
    }
    // Remove leading checkbox if present
    let displayText = cleanText.replace(/^-\s*\[\s*\]\s*/, "").replace(/^-\s*\[x\]\s*/i, "");
    // Remove block-level markdown markers (headings, list bullets, quotes)
    displayText = displayText
      .replace(/^#{1,6}\s+/, "")   // Remove heading markers
      .replace(/^[*\-+]\s+/, "")   // Remove list markers
      .replace(/^>\s+/, "");        // Remove quote markers

    // Render inline markdown manually to avoid extra <p> tags
    this.renderInlineMarkdown(displayText, textSpan);
    textSpan.append(" ");

    // Add completion date with muted pill style for completed items
    if (completionDate) {
      rowContainer.createEl("span", {
        cls: "todo-date muted-pill",
        text: completionDate,
      });
    }

    // Add link to source
    const link = rowContainer.createEl("a", {
      text: "→",
      cls: "todo-source-link",
      href: "#",
    });

    link.addEventListener("click", (e) => {
      e.preventDefault();
      openFileAtLine(this.app, todo.file, todo.lineNumber);
    });

    // If this is a header with children, render children indented below
    if (isHeader && todo.childLineNumbers && todo.childLineNumbers.length > 0) {
      const childrenContainer = item.createEl("ul", { cls: "todo-children contains-task-list" });
      for (const childLine of todo.childLineNumbers) {
        const childTodo = allTodos.find(
          t => t.filePath === todo.filePath && t.lineNumber === childLine
        );
        if (childTodo) {
          // Skip completed children if showTodones is false
          if (!showTodones && childTodo.tags.includes("#todone")) {
            continue;
          }
          this.renderTodoItem(childrenContainer, childTodo, allTodos, showTodones, todoneFile, filterString, true);
        }
      }
    }
  }

  // Render ideas list (similar to renderTodoList but for ideas)
  private renderIdeaList(
    container: HTMLElement,
    ideas: TodoItem[],
    filterString: string = "",
    unfilteredIdeas?: TodoItem[]
  ): void {
    container.empty();
    container.addClass("space-command-embed", "focus-ideas-embed");

    // Add header with refresh button
    const header = container.createEl("div", { cls: "embed-header" });

    const refreshBtn = header.createEl("button", {
      cls: "clickable-icon embed-refresh-btn",
      attr: { "aria-label": "Refresh" },
    });
    refreshBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>';

    refreshBtn.addEventListener("click", () => {
      this.refreshIdeaEmbed(container, filterString);
    });

    // Set up auto-refresh listener
    this.setupIdeaAutoRefresh(container, filterString);

    if (ideas.length === 0) {
      container.createEl("div", {
        text: "No ideas",
        cls: "space-command-empty",
      });
      return;
    }

    // Filter out child items (they'll be rendered under their parent header)
    const topLevelIdeas = ideas.filter(i => i.parentLineNumber === undefined);

    const list = container.createEl("ul", { cls: "idea-list" });

    // Use unfiltered ideas for child lookup
    const allIdeasForLookup = unfilteredIdeas || ideas;

    for (const idea of topLevelIdeas) {
      this.renderIdeaItem(list, idea, allIdeasForLookup, filterString);
    }
  }

  // Render a single idea item (and its children if it's a header)
  private renderIdeaItem(
    list: HTMLElement,
    idea: TodoItem,
    allIdeas: TodoItem[],
    filterString: string,
    isChild: boolean = false
  ): void {
    const isHeader = idea.isHeader === true;
    const hasChildren = isHeader && idea.childLineNumbers && idea.childLineNumbers.length > 0;

    const itemClasses = [
      'idea-item',
      isHeader ? 'idea-header' : '',
      isChild ? 'idea-child' : '',
      hasChildren ? 'idea-header-with-children' : ''
    ].filter(c => c).join(' ');

    const item = list.createEl("li", { cls: itemClasses });

    // For headers with children, create a row container
    const rowContainer = hasChildren
      ? item.createEl("div", { cls: "idea-header-row" })
      : item;

    // Add idea text (without the #idea tag)
    const textSpan = rowContainer.createEl("span", { cls: "idea-text" });
    let cleanText = idea.text.replace(/#ideas?\b/g, "").trim();
    // Remove leading checkbox if present
    let displayText = cleanText.replace(/^-\s*\[\s*\]\s*/, "").replace(/^-\s*\[x\]\s*/i, "");
    // Remove block-level markdown markers
    displayText = displayText
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[*\-+]\s+/, "")
      .replace(/^>\s+/, "");

    this.renderInlineMarkdown(displayText, textSpan);
    textSpan.append(" ");

    // Add link to source
    const link = rowContainer.createEl("a", {
      text: "→",
      cls: "idea-source-link",
      href: "#",
    });

    link.addEventListener("click", (e) => {
      e.preventDefault();
      openFileAtLine(this.app, idea.file, idea.lineNumber);
    });

    // If this is a header with children, render children indented below
    if (isHeader && idea.childLineNumbers && idea.childLineNumbers.length > 0) {
      const childrenContainer = item.createEl("ul", { cls: "idea-children" });
      for (const childLine of idea.childLineNumbers) {
        const childIdea = allIdeas.find(
          i => i.filePath === idea.filePath && i.lineNumber === childLine
        );
        if (childIdea) {
          this.renderIdeaItem(childrenContainer, childIdea, allIdeas, filterString, true);
        }
      }
    }
  }

  // Render principles list
  private renderPrincipleList(
    container: HTMLElement,
    principles: TodoItem[],
    filterString: string = "",
    unfilteredPrinciples?: TodoItem[]
  ): void {
    container.empty();
    container.addClass("space-command-embed", "focus-principles-embed");

    // Add header with refresh button
    const header = container.createEl("div", { cls: "embed-header" });

    const refreshBtn = header.createEl("button", {
      cls: "clickable-icon embed-refresh-btn",
      attr: { "aria-label": "Refresh" },
    });
    refreshBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>';

    refreshBtn.addEventListener("click", () => {
      this.refreshPrincipleEmbed(container, filterString);
    });

    // Set up auto-refresh listener
    this.setupPrincipleAutoRefresh(container, filterString);

    if (principles.length === 0) {
      container.createEl("div", {
        text: "No principles",
        cls: "space-command-empty",
      });
      return;
    }

    // Filter out child items
    const topLevelPrinciples = principles.filter(p => p.parentLineNumber === undefined);

    const list = container.createEl("ul", { cls: "principle-list" });

    // Use unfiltered principles for child lookup
    const allPrinciplesForLookup = unfilteredPrinciples || principles;

    for (const principle of topLevelPrinciples) {
      this.renderPrincipleItem(list, principle, allPrinciplesForLookup, filterString);
    }
  }

  // Render a single principle item (and its children if it's a header)
  private renderPrincipleItem(
    list: HTMLElement,
    principle: TodoItem,
    allPrinciples: TodoItem[],
    filterString: string,
    isChild: boolean = false
  ): void {
    const isHeader = principle.isHeader === true;
    const hasChildren = isHeader && principle.childLineNumbers && principle.childLineNumbers.length > 0;

    const itemClasses = [
      'principle-item',
      isHeader ? 'principle-header' : '',
      isChild ? 'principle-child' : '',
      hasChildren ? 'principle-header-with-children' : ''
    ].filter(c => c).join(' ');

    const item = list.createEl("li", { cls: itemClasses });

    // For headers with children, create a row container
    const rowContainer = hasChildren
      ? item.createEl("div", { cls: "principle-header-row" })
      : item;

    // Add principle text (without the #principle tag)
    const textSpan = rowContainer.createEl("span", { cls: "principle-text" });
    let cleanText = principle.text.replace(/#principles?\b/g, "").trim();
    // Remove leading checkbox if present
    let displayText = cleanText.replace(/^-\s*\[\s*\]\s*/, "").replace(/^-\s*\[x\]\s*/i, "");
    // Remove block-level markdown markers
    displayText = displayText
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[*\-+]\s+/, "")
      .replace(/^>\s+/, "");

    this.renderInlineMarkdown(displayText, textSpan);
    textSpan.append(" ");

    // Add link to source
    const link = rowContainer.createEl("a", {
      text: "→",
      cls: "principle-source-link",
      href: "#",
    });

    link.addEventListener("click", (e) => {
      e.preventDefault();
      openFileAtLine(this.app, principle.file, principle.lineNumber);
    });

    // If this is a header with children, render children indented below
    if (isHeader && principle.childLineNumbers && principle.childLineNumbers.length > 0) {
      const childrenContainer = item.createEl("ul", { cls: "principle-children" });
      for (const childLine of principle.childLineNumbers) {
        const childPrinciple = allPrinciples.find(
          p => p.filePath === principle.filePath && p.lineNumber === childLine
        );
        if (childPrinciple) {
          this.renderPrincipleItem(childrenContainer, childPrinciple, allPrinciples, filterString, true);
        }
      }
    }
  }

  // Render inline markdown without creating block elements
  // Uses DOM methods to avoid XSS vulnerabilities
  private renderInlineMarkdown(text: string, container: HTMLElement): void {
    // Process markdown inline syntax (bold, italic, links)
    // This avoids the extra <p> tags that MarkdownRenderer adds

    // Parse markdown tokens
    const tokens = this.parseMarkdownTokens(text);

    // Priority tags that should get muted-pill styling
    const mutedTags = ['#focus', '#future', '#p0', '#p1', '#p2', '#p3', '#p4'];

    // Render tokens as DOM elements
    for (const token of tokens) {
      switch (token.type) {
        case 'text':
          // Check for priority tags in text and style them
          renderTextWithTags(token.content, container, mutedTags);
          break;
        case 'bold':
          container.createEl('strong', { text: token.content });
          break;
        case 'italic':
          container.createEl('em', { text: token.content });
          break;
        case 'code':
          container.createEl('code', { text: token.content });
          break;
        case 'link':
          container.createEl('a', {
            text: token.content,
            attr: { href: token.url || '#' }
          });
          break;
      }
    }
  }


  // Parse markdown into tokens for safe rendering
  private parseMarkdownTokens(text: string): Array<{
    type: 'text' | 'bold' | 'italic' | 'code' | 'link';
    content: string;
    url?: string;
  }> {
    const tokens: Array<{
      type: 'text' | 'bold' | 'italic' | 'code' | 'link';
      content: string;
      url?: string;
    }> = [];

    let remaining = text;

    while (remaining.length > 0) {
      // Try to match markdown patterns
      let matched = false;

      // Bold: **text** or __text__
      let match = remaining.match(/^(\*\*|__)(.+?)\1/);
      if (match) {
        tokens.push({ type: 'bold', content: match[2] });
        remaining = remaining.substring(match[0].length);
        matched = true;
        continue;
      }

      // Code: `text`
      match = remaining.match(/^`([^`]+)`/);
      if (match) {
        tokens.push({ type: 'code', content: match[1] });
        remaining = remaining.substring(match[0].length);
        matched = true;
        continue;
      }

      // Links: [text](url)
      match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        tokens.push({ type: 'link', content: match[1], url: match[2] });
        remaining = remaining.substring(match[0].length);
        matched = true;
        continue;
      }

      // Italic: *text* or _text_
      match = remaining.match(/^(\*|_)([^\s\*_][^\*_]*?)\1/);
      if (match) {
        tokens.push({ type: 'italic', content: match[2] });
        remaining = remaining.substring(match[0].length);
        matched = true;
        continue;
      }

      // No markdown pattern found, consume one character as text
      if (!matched) {
        // Find the next markdown character or end of string
        const nextSpecial = remaining.search(/[\*_`\[]/);
        if (nextSpecial === -1) {
          // No more markdown, add rest as text
          tokens.push({ type: 'text', content: remaining });
          break;
        } else if (nextSpecial > 0) {
          // Add text before next markdown
          tokens.push({ type: 'text', content: remaining.substring(0, nextSpecial) });
          remaining = remaining.substring(nextSpecial);
        } else {
          // Special char at start but didn't match pattern, treat as text
          tokens.push({ type: 'text', content: remaining[0] });
          remaining = remaining.substring(1);
        }
      }
    }

    return tokens;
  }

  // Setup auto-refresh for focus list embed
  private setupFocusListAutoRefresh(container: HTMLElement): void {
    // Clean up any existing listener for this container
    this.cleanup(container);

    // Create new listener
    const listener = () => {
      // Check if container is still in DOM
      if (container.isConnected) {
        this.renderFocusList(container);
      } else {
        // Container was removed, clean up
        this.cleanup(container);
      }
    };

    // Register listener
    this.scanner.on("todos-updated", listener);
    this.activeRenders.set(container, listener);
  }

  // Setup auto-refresh for this embed
  private setupAutoRefresh(
    container: HTMLElement,
    todoneFile: string,
    filterString: string
  ): void {
    // Clean up any existing listener for this container
    this.cleanup(container);

    // Create new listener
    const listener = () => {
      // Check if container is still in DOM
      if (container.isConnected) {
        this.refreshEmbed(container, todoneFile, filterString);
      } else {
        // Container was removed, clean up
        this.cleanup(container);
      }
    };

    // Register listener
    this.scanner.on("todos-updated", listener);
    this.activeRenders.set(container, listener);
  }

  // Refresh a specific embed
  private refreshEmbed(
    container: HTMLElement,
    todoneFile: string,
    filterString: string
  ): void {
    const filters = FilterParser.parse(filterString);
    // Get both TODOs and TODONEs
    const allTodos = this.scanner.getTodos();
    const allTodones = this.scanner.getTodones();
    // Keep unfiltered list for child lookup
    const unfiltered = [...allTodos, ...allTodones];
    // Apply filters
    const filteredTodos = FilterParser.applyFilters(allTodos, filters);
    const filteredTodones = FilterParser.applyFilters(allTodones, filters);
    const combined = [...filteredTodos, ...filteredTodones];
    this.renderTodoList(container, combined, todoneFile, filterString, unfiltered);
  }

  // Setup auto-refresh for idea embeds
  private setupIdeaAutoRefresh(
    container: HTMLElement,
    filterString: string
  ): void {
    this.cleanup(container);

    const listener = () => {
      if (container.isConnected) {
        this.refreshIdeaEmbed(container, filterString);
      } else {
        this.cleanup(container);
      }
    };

    this.scanner.on("todos-updated", listener);
    this.activeRenders.set(container, listener);
  }

  // Refresh idea embed
  private refreshIdeaEmbed(
    container: HTMLElement,
    filterString: string
  ): void {
    const filters = FilterParser.parse(filterString);
    const allIdeas = this.scanner.getIdeas();
    const filteredIdeas = FilterParser.applyFilters(allIdeas, filters);
    this.renderIdeaList(container, filteredIdeas, filterString, allIdeas);
  }

  // Setup auto-refresh for principle embeds
  private setupPrincipleAutoRefresh(
    container: HTMLElement,
    filterString: string
  ): void {
    this.cleanup(container);

    const listener = () => {
      if (container.isConnected) {
        this.refreshPrincipleEmbed(container, filterString);
      } else {
        this.cleanup(container);
      }
    };

    this.scanner.on("todos-updated", listener);
    this.activeRenders.set(container, listener);
  }

  // Refresh principle embed
  private refreshPrincipleEmbed(
    container: HTMLElement,
    filterString: string
  ): void {
    const filters = FilterParser.parse(filterString);
    const allPrinciples = this.scanner.getPrinciples();
    const filteredPrinciples = FilterParser.applyFilters(allPrinciples, filters);
    this.renderPrincipleList(container, filteredPrinciples, filterString, allPrinciples);
  }

}
