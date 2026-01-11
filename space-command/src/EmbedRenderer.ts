import { App } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { TodoProcessor } from "./TodoProcessor";
import { ProjectManager } from "./ProjectManager";
import { FilterParser } from "./FilterParser";
import { ContextMenuHandler } from "./ContextMenuHandler";
import { TodoItem } from "./types";

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
    let todos = this.scanner.getTodos();
    let todones = this.scanner.getTodones();
    // Apply filters to both
    todos = FilterParser.applyFilters(todos, filters);
    todones = FilterParser.applyFilters(todones, filters);
    // Combine them - sortTodos will separate and sort them properly
    const combined = [...todos, ...todones];
    this.renderTodoList(container, combined, todoneFile, filterString);
  }

  // Public helper method for focus-list code blocks
  public renderProjects(container: HTMLElement): void {
    this.renderFocusList(container);
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

    // Get both TODOs and TODONEs, apply filters
    let todos = this.scanner.getTodos();
    let todones = this.scanner.getTodones();
    todos = FilterParser.applyFilters(todos, filters);
    todones = FilterParser.applyFilters(todones, filters);
    const combined = [...todos, ...todones];

    // Render the todo list
    this.renderTodoList(el, combined, todoneFile, filterString);
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

      // Project tag with count
      const textSpan = item.createEl("span", { cls: "focus-project-text" });
      textSpan.textContent = `${project.tag} (${project.count}) `;

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

  private getPriorityValue(todo: TodoItem): number {
    // Priority order: #focus=0, #p0=1, #p1=2, #p2=3, no priority=4, #p3=5, #p4=6, #future=7
    if (todo.tags.includes("#focus")) return 0;
    if (todo.tags.includes("#p0")) return 1;
    if (todo.tags.includes("#p1")) return 2;
    if (todo.tags.includes("#p2")) return 3;
    if (todo.tags.includes("#p3")) return 5;
    if (todo.tags.includes("#p4")) return 6;
    if (todo.tags.includes("#future")) return 7;
    return 4; // No priority = medium (between #p2 and #p3)
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
      const priorityDiff = this.getPriorityValue(a) - this.getPriorityValue(b);
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
    filterString: string = ""
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

    for (const todo of sortedTodos) {
      // Pass full todos array for child lookup, and showTodones for visibility
      this.renderTodoItem(list, todo, todos, showTodones, todoneFile, filterString);
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
    let cleanText = todo.text.replace(/#todo\b/g, "").replace(/#todone\b/g, "").trim();
    // Remove completion date from display text (we'll show it separately)
    const completionDate = isCompleted ? this.extractCompletionDate(cleanText) : null;
    if (completionDate) {
      cleanText = cleanText.replace(/@\d{4}-\d{2}-\d{2}/, "").trim();
    }
    // Remove leading checkbox if present
    let displayText = cleanText.replace(/^-\s*\[\s*\]\s*/, "").replace(/^-\s*\[x\]\s*/i, "");
    // Remove block-level markdown markers (list bullets, quotes)
    displayText = displayText
      .replace(/^[*\-+]\s+/, "")  // Remove list markers
      .replace(/^>\s+/, "");       // Remove quote markers

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
      this.openFileAtLine(todo.file, todo.lineNumber);
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
          this.renderTextWithTags(token.content, container, mutedTags);
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

  // Render text content, applying muted-pill styling to priority tags
  private renderTextWithTags(text: string, container: HTMLElement, mutedTags: string[]): void {
    // Regex to find tags (words starting with #)
    const tagRegex = /(#[\w-]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      // Add text before the tag
      if (match.index > lastIndex) {
        container.appendText(text.substring(lastIndex, match.index));
      }

      const tag = match[1];
      if (mutedTags.includes(tag)) {
        // Priority tag: use muted-pill styling
        container.createEl('span', {
          cls: 'tag muted-pill',
          text: tag,
        });
      } else {
        // Regular tag: still style as tag but without muted-pill
        container.createEl('span', {
          cls: 'tag',
          text: tag,
        });
      }

      lastIndex = tagRegex.lastIndex;
    }

    // Add remaining text after last tag
    if (lastIndex < text.length) {
      container.appendText(text.substring(lastIndex));
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
    let todos = this.scanner.getTodos();
    let todones = this.scanner.getTodones();
    todos = FilterParser.applyFilters(todos, filters);
    todones = FilterParser.applyFilters(todones, filters);
    const combined = [...todos, ...todones];
    this.renderTodoList(container, combined, todoneFile, filterString);
  }

  private openFileAtLine(file: any, line: number): void {
    const leaf = this.app.workspace.getLeaf(false);
    leaf.openFile(file, { active: true }).then(() => {
      const view = this.app.workspace.getActiveViewOfType(
        require("obsidian").MarkdownView
      );
      if (view && (view as any).editor) {
        const editor = (view as any).editor;

        // Set cursor to the line
        editor.setCursor({ line, ch: 0 });

        // Scroll the line into view
        editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);

        // Highlight the line
        this.highlightLine(editor, line);
      }
    });
  }

  private highlightLine(editor: any, line: number): void {
    // Get the line length
    const lineText = editor.getLine(line);
    const lineLength = lineText.length;

    // Select the entire line
    editor.setSelection(
      { line, ch: 0 },
      { line, ch: lineLength }
    );

    // Clear the selection after a delay to create a highlight effect
    setTimeout(() => {
      editor.setCursor({ line, ch: 0 });
    }, 1500);
  }
}
