import { ItemView, WorkspaceLeaf } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { TodoProcessor } from "./TodoProcessor";
import { ProjectManager } from "./ProjectManager";
import { TodoItem } from "./types";

export const VIEW_TYPE_TODO_SIDEBAR = "space-command-sidebar";

export class TodoSidebarView extends ItemView {
  private scanner: TodoScanner;
  private processor: TodoProcessor;
  private projectManager: ProjectManager;
  private defaultTodoneFile: string;
  private todonesCollapsed: boolean = false;
  private projectsCollapsed: boolean = false;
  private updateListener: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    scanner: TodoScanner,
    processor: TodoProcessor,
    projectManager: ProjectManager,
    defaultTodoneFile: string
  ) {
    super(leaf);
    this.scanner = scanner;
    this.processor = processor;
    this.projectManager = projectManager;
    this.defaultTodoneFile = defaultTodoneFile;
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

  private wrapTagsInSpans(text: string): string {
    // Wrap tags in spans for styling
    return text.replace(/(#[\w-]+)/g, '<span class="tag">$1</span>');
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
    headerDiv.createEl("h4", { text: "⌥⌘ TODOs" });

    const buttonGroup = headerDiv.createEl("div", { cls: "sidebar-button-group" });

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

    // Projects section
    this.renderProjects(container);

    // Active TODOs section
    this.renderActiveTodos(container);

    // Recent TODONEs section
    this.renderRecentTodones(container);
  }

  private sortTodosByDate(todos: TodoItem[]): TodoItem[] {
    return [...todos].sort((a, b) => a.dateCreated - b.dateCreated);
  }

  private renderProjects(container: HTMLElement): void {
    const projects = this.projectManager.getProjects();

    const section = container.createEl("div", { cls: "projects-section" });

    const header = section.createEl("div", {
      cls: "todo-section-header projects-header",
    });

    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    const collapseIcon = this.projectsCollapsed ? "▶" : "▼";
    titleSpan.innerHTML = `<span class="collapse-icon">${collapseIcon}</span> Projects <span class="project-count">(${projects.length})</span>`;

    header.addEventListener("click", () => {
      this.projectsCollapsed = !this.projectsCollapsed;
      this.render();
    });

    if (this.projectsCollapsed) {
      return;
    }

    if (projects.length === 0) {
      section.createEl("div", {
        text: "No projects yet",
        cls: "todo-empty",
      });
      return;
    }

    // Sort projects by count (descending)
    projects.sort((a, b) => b.count - a.count);

    const list = section.createEl("ul", { cls: "project-list" });

    for (const project of projects) {
      this.renderProjectItem(list, project);
    }
  }

  private renderProjectItem(list: HTMLElement, project: any): void {
    const item = list.createEl("li", { cls: "project-item" });

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

    // Project name and count
    const textSpan = item.createEl("span", { cls: "project-text" });
    textSpan.innerHTML = `${project.tag} <span class="project-count">(${project.count})</span> `;

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
    todos = this.sortTodosByDate(todos);

    const section = container.createEl("div", { cls: "todo-section" });

    const header = section.createEl("div", { cls: "todo-section-header" });
    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    titleSpan.innerHTML = `▼ Active TODOs <span class="todo-count">(${todos.length})</span>`;

    if (todos.length === 0) {
      section.createEl("div", {
        text: "No active TODOs",
        cls: "todo-empty",
      });
      return;
    }

    const list = section.createEl("ul", { cls: "todo-list" });

    for (const todo of todos) {
      this.renderTodoItem(list, todo);
    }
  }

  private renderTodoItem(list: HTMLElement, todo: TodoItem): void {
    const item = list.createEl("li", { cls: "todo-item" });

    // Checkbox
    const checkbox = item.createEl("input", {
      type: "checkbox",
      cls: "todo-checkbox",
    });

    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      const success = await this.processor.completeTodo(
        todo,
        this.defaultTodoneFile
      );
      if (success) {
        // Re-render the entire sidebar
        this.render();
      } else {
        checkbox.disabled = false;
      }
    });

    // Text content (strip markdown but keep tags)
    const textSpan = item.createEl("span", { cls: "todo-text" });
    const cleanText = todo.text.replace(/#todo\b/g, "").trim();
    const displayText = this.stripMarkdownSyntax(cleanText);
    const displayWithStyledTags = this.wrapTagsInSpans(displayText);
    textSpan.innerHTML = displayWithStyledTags + " ";

    // Link to source
    const link = item.createEl("a", {
      text: "→",
      cls: "todo-link",
      href: "#",
    });

    link.addEventListener("click", (e) => {
      e.preventDefault();
      this.openFileAtLine(todo.file, todo.lineNumber);
    });
  }

  private renderRecentTodones(container: HTMLElement): void {
    const todones = this.scanner.getTodones(10); // Show last 10

    const section = container.createEl("div", { cls: "todone-section" });

    const header = section.createEl("div", {
      cls: "todo-section-header todone-header",
    });

    const titleSpan = header.createEl("span", { cls: "todo-section-title" });
    const collapseIcon = this.todonesCollapsed ? "▶" : "▼";
    titleSpan.innerHTML = `<span class="collapse-icon">${collapseIcon}</span> Recent TODONEs <span class="todo-count">(${todones.length})</span>`;

    header.addEventListener("click", () => {
      this.todonesCollapsed = !this.todonesCollapsed;
      this.render();
    });

    if (this.todonesCollapsed) {
      return;
    }

    if (todones.length === 0) {
      section.createEl("div", {
        text: "No completed TODOs yet",
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

    // Checked checkbox (non-interactive)
    item.createEl("input", {
      type: "checkbox",
      cls: "todo-checkbox",
      attr: { checked: "checked", disabled: "disabled" },
    });

    // Text content (strip markdown but keep tags)
    const textSpan = item.createEl("span", { cls: "todo-text todone-text" });
    const cleanText = todone.text.replace(/#todone\b/g, "").trim();
    const displayText = this.stripMarkdownSyntax(cleanText);
    const displayWithStyledTags = this.wrapTagsInSpans(displayText);
    textSpan.innerHTML = displayWithStyledTags + " ";

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

  private async confirmCompleteProject(project: any): Promise<boolean> {
    return new Promise((resolve) => {
      const { Modal } = require("obsidian");
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

  private async completeAllProjectTodos(project: any): Promise<void> {
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

    const { Notice } = require("obsidian");
    if (failed > 0) {
      new Notice(
        `Completed ${completed} TODO(s), ${failed} failed. See console for details.`
      );
    } else {
      new Notice(`Completed all ${completed} TODO(s) for ${project.tag}!`);
    }

    this.render();
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
