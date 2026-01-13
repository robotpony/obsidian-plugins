import { ItemView, WorkspaceLeaf, TFile, Menu, Notice, Modal, MarkdownView } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { TodoProcessor } from "./TodoProcessor";
import { ProjectManager } from "./ProjectManager";
import { TodoItem, ProjectInfo } from "./types";
import { ContextMenuHandler } from "./ContextMenuHandler";
import { getPriorityValue, LOGO_PREFIX } from "./utils";

export const VIEW_TYPE_TODO_SIDEBAR = "space-command-sidebar";

export class TodoSidebarView extends ItemView {
  private scanner: TodoScanner;
  private processor: TodoProcessor;
  private projectManager: ProjectManager;
  private defaultTodoneFile: string;
  private updateListener: (() => void) | null = null;
  private contextMenuHandler: ContextMenuHandler;
  private recentTodonesLimit: number;

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

  // Render text with tags safely using DOM methods (avoids XSS)
  private renderTextWithTags(text: string, container: HTMLElement): void {
    const tagRegex = /(#[\w-]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      // Add text before the tag
      if (match.index > lastIndex) {
        container.appendText(text.substring(lastIndex, match.index));
      }
      // Add the tag as a styled span
      container.createEl("span", {
        cls: "tag",
        text: match[1],
      });
      lastIndex = tagRegex.lastIndex;
    }

    // Add remaining text after last tag
    if (lastIndex < text.length) {
      container.appendText(text.substring(lastIndex));
    }
  }

  async onOpen(): Promise<void> {
    // Set up auto-refresh listener
    this.updateListener = () => this.render();
    this.scanner.on("todos-updated", this.updateListener);

    this.render();
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
    const titleEl = headerDiv.createEl("h4");
    titleEl.createEl("span", { cls: "space-command-logo", text: "⌥⌘" });
    titleEl.appendText(" TODOs");

    const buttonGroup = headerDiv.createEl("div", { cls: "sidebar-button-group" });

    // Settings button
    const settingsBtn = buttonGroup.createEl("button", {
      cls: "clickable-icon sidebar-settings-btn",
      attr: { "aria-label": "Open Settings" },
    });
    settingsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v6m0 6v6m9-9h-6m-6 0H3"></path></svg>';

    settingsBtn.addEventListener("click", () => {
      // Open settings
      (this.app as any).setting.open();
      (this.app as any).setting.openTabById("space-command");
    });

    // Refresh button
    const refreshBtn = buttonGroup.createEl("button", {
      cls: "clickable-icon sidebar-refresh-btn",
      attr: { "aria-label": "Refresh TODOs" },
    });
    refreshBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>';

    refreshBtn.addEventListener("click", async () => {
      refreshBtn.addClass("rotating");
      await this.scanner.scanVault();
      setTimeout(() => refreshBtn.removeClass("rotating"), 500);
    });

    // Copy embed button
    const copyBtn = buttonGroup.createEl("button", {
      cls: "clickable-icon sidebar-copy-btn",
      attr: { "aria-label": "Copy embed syntax" },
    });
    copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

    copyBtn.addEventListener("click", (evt) => {
      const menu = new Menu();
      menu.addItem((item) => {
        item
          .setTitle("Embed TODOs (inline)")
          .setIcon("brackets")
          .onClick(() => {
            navigator.clipboard.writeText("{{focus-todos}}");
            new Notice(`${LOGO_PREFIX} Copied inline embed syntax`);
          });
      });
      menu.addItem((item) => {
        item
          .setTitle("Embed TODOs (code block)")
          .setIcon("code")
          .onClick(() => {
            navigator.clipboard.writeText("```focus-todos\n```");
            new Notice(`${LOGO_PREFIX} Copied code block embed syntax`);
          });
      });
      menu.showAtMouseEvent(evt);
    });

    // Projects section
    this.renderProjects(container);

    // Active TODOs section
    this.renderActiveTodos(container);

    // Recent TODONEs section
    this.renderRecentTodones(container);
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
    titleSpan.innerHTML = `Focus <span class="project-count">${projects.length}</span>`;

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

    // Project name and count (using safe DOM methods)
    const textSpan = item.createEl("span", { cls: "project-text" });
    textSpan.appendText(project.tag + " ");
    textSpan.createEl("span", { cls: "project-count", text: String(project.count) });
    textSpan.appendText(" ");

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
    titleSpan.innerHTML = `TODO <span class="todo-count">${todos.length}</span>`;

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
    const hasFocus = todo.tags.includes("#focus");
    const isHeader = todo.isHeader === true;
    const hasChildren = isHeader && todo.childLineNumbers && todo.childLineNumbers.length > 0;

    const itemClasses = [
      'todo-item',
      hasFocus ? 'todo-focus' : '',
      isHeader ? 'todo-header' : '',
      isChild ? 'todo-child' : '',
      hasChildren ? 'todo-header-with-children' : ''
    ].filter(c => c).join(' ');

    const item = list.createEl("li", { cls: itemClasses });

    // Add right-click context menu
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.contextMenuHandler.showTodoMenu(e, todo, () => this.render());
    });

    // For headers with children, create a row container for the header content
    const rowContainer = hasChildren
      ? item.createEl("div", { cls: "todo-header-row" })
      : item;

    // Checkbox
    const checkbox = rowContainer.createEl("input", {
      type: "checkbox",
      cls: "todo-checkbox",
    });

    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      const success = await this.processor.completeTodo(
        todo,
        this.defaultTodoneFile
      );
      if (!success) {
        checkbox.disabled = false;
      }
      // Note: sidebar will auto-refresh via todos-updated event after scanner rescans
    });

    // Text content (strip markdown but keep tags)
    const textSpan = rowContainer.createEl("span", { cls: "todo-text" });
    const cleanText = todo.text.replace(/#todo\b/g, "").trim();
    const displayText = this.stripMarkdownSyntax(cleanText);
    this.renderTextWithTags(displayText, textSpan);

    // For headers with children, append count inline with text
    if (hasChildren) {
      const childCount = todo.childLineNumbers!.length;
      textSpan.createEl("span", { cls: "todo-count", text: ` ${childCount}` });
    }
    textSpan.appendText(" ");

    // Link to source
    const link = rowContainer.createEl("a", {
      text: "→",
      cls: "todo-link",
      href: "#",
    });

    link.addEventListener("click", (e) => {
      e.preventDefault();
      this.openFileAtLine(todo.file, todo.lineNumber);
    });

    // If this is a header with children, render children indented below (outside the row)
    if (hasChildren) {
      const childrenContainer = item.createEl("ul", { cls: "todo-children" });
      // Get children from scanner by line numbers
      const allTodos = this.scanner.getTodos();
      for (const childLine of todo.childLineNumbers!) {
        const childTodo = allTodos.find(
          t => t.filePath === todo.filePath && t.lineNumber === childLine
        );
        if (childTodo) {
          this.renderTodoItem(childrenContainer, childTodo, true);
        }
      }
    }
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
    this.renderTextWithTags(displayText, textSpan);
    textSpan.appendText(" ");

    // Link to source
    const link = item.createEl("a", {
      text: "→",
      cls: "todo-link",
      href: "#",
    });

    link.addEventListener("click", (e) => {
      e.preventDefault();
      this.openFileAtLine(todone.file, todone.lineNumber);
    });
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

  private openFileAtLine(file: TFile, line: number): void {
    const leaf = this.app.workspace.getLeaf(false);
    leaf.openFile(file, { active: true }).then(() => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view?.editor) {
        const editor = view.editor;

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
