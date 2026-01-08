import { ItemView, WorkspaceLeaf } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { TodoProcessor } from "./TodoProcessor";
import { ProjectManager } from "./ProjectManager";
import { TodoItem } from "./types";

export const VIEW_TYPE_TODO_SIDEBAR = "space-command-sidebar";

type SortMode = "date" | "file" | "folder";

export class TodoSidebarView extends ItemView {
  private scanner: TodoScanner;
  private processor: TodoProcessor;
  private projectManager: ProjectManager;
  private defaultTodoneFile: string;
  private todonesCollapsed: boolean = false;
  private projectsCollapsed: boolean = false;
  private updateListener: (() => void) | null = null;
  private sortMode: SortMode = "date";
  private onPinnedProjectsChanged: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    scanner: TodoScanner,
    processor: TodoProcessor,
    projectManager: ProjectManager,
    defaultTodoneFile: string,
    onPinnedProjectsChanged?: () => void
  ) {
    super(leaf);
    this.scanner = scanner;
    this.processor = processor;
    this.projectManager = projectManager;
    this.defaultTodoneFile = defaultTodoneFile;
    this.onPinnedProjectsChanged = onPinnedProjectsChanged || null;
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

    // Sort button
    const sortBtn = buttonGroup.createEl("button", {
      cls: "clickable-icon sidebar-sort-btn",
      attr: { "aria-label": `Sort by: ${this.sortMode}` },
    });
    this.updateSortIcon(sortBtn);

    sortBtn.addEventListener("click", () => {
      this.cycleSortMode();
      this.updateSortIcon(sortBtn);
      sortBtn.setAttribute("aria-label", `Sort by: ${this.sortMode}`);
      this.render();
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

    // Projects section
    this.renderProjects(container);

    // Active TODOs section
    this.renderActiveTodos(container);

    // Recent TODONEs section
    this.renderRecentTodones(container);
  }

  private cycleSortMode(): void {
    const modes: SortMode[] = ["date", "file", "folder"];
    const currentIndex = modes.indexOf(this.sortMode);
    this.sortMode = modes[(currentIndex + 1) % modes.length];
  }

  private updateSortIcon(button: HTMLElement): void {
    const icons = {
      date: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
      file: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>',
      folder: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>'
    };
    button.innerHTML = icons[this.sortMode];
  }

  private sortTodos(todos: TodoItem[]): TodoItem[] {
    const sorted = [...todos];
    switch (this.sortMode) {
      case "date":
        return sorted.sort((a, b) => a.dateCreated - b.dateCreated);
      case "file":
        return sorted.sort((a, b) => a.filePath.localeCompare(b.filePath));
      case "folder":
        return sorted.sort((a, b) => {
          const folderCompare = a.folder.localeCompare(b.folder);
          if (folderCompare !== 0) return folderCompare;
          return a.filePath.localeCompare(b.filePath);
        });
    }
  }

  private renderProjects(container: HTMLElement): void {
    const projects = this.projectManager.getProjects();

    const section = container.createEl("div", { cls: "projects-section" });

    const header = section.createEl("div", {
      cls: "todo-section-header projects-header",
    });

    const titleSpan = header.createEl("span", {
      text: this.projectsCollapsed ? "▶" : "▼",
      cls: "collapse-icon",
    });

    titleSpan.appendText(` Projects (${projects.length})`);
    titleSpan.addClass("todo-section-title");

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

    // Sort projects by pinned first, then by count
    projects.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.count - a.count;
    });

    const list = section.createEl("ul", { cls: "project-list" });

    for (const project of projects) {
      this.renderProjectItem(list, project);
    }
  }

  private renderProjectItem(list: HTMLElement, project: any): void {
    const item = list.createEl("li", { cls: "project-item" });

    // Star icon for pinning
    const starBtn = item.createEl("button", {
      cls: `project-star ${project.isPinned ? "pinned" : ""}`,
      attr: { "aria-label": project.isPinned ? "Unpin project" : "Pin project" },
    });
    starBtn.innerHTML = project.isPinned
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

    starBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.projectManager.togglePin(project.tag);
      if (this.onPinnedProjectsChanged) {
        this.onPinnedProjectsChanged();
      }
      this.render();
    });

    // Project name and count
    const textSpan = item.createEl("span", { cls: "project-text" });
    textSpan.textContent = `${project.tag} (${project.count}) `;

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
    todos = this.sortTodos(todos);

    const section = container.createEl("div", { cls: "todo-section" });

    const header = section.createEl("div", { cls: "todo-section-header" });
    header.createEl("span", {
      text: `▼ Active TODOs (${todos.length})`,
      cls: "todo-section-title",
    });

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

    // Star icon for pinning project tags
    const projectTags = todo.tags.filter(
      (tag) => tag !== "#todo" && tag !== "#todone"
    );
    if (projectTags.length > 0) {
      const primaryTag = projectTags[0]; // Use first project tag
      const isPinned = this.projectManager.isPinned(primaryTag);

      const starBtn = item.createEl("button", {
        cls: `todo-star ${isPinned ? "pinned" : ""}`,
        attr: { "aria-label": isPinned ? "Unpin project" : "Pin project" },
      });
      starBtn.innerHTML = isPinned
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

      starBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.projectManager.togglePin(primaryTag);
        if (this.onPinnedProjectsChanged) {
          this.onPinnedProjectsChanged();
        }
        this.render();
      });
    }

    // Text content
    const textSpan = item.createEl("span", { cls: "todo-text" });
    const cleanText = todo.text.replace(/#todo\b/g, "").trim();
    const displayText = cleanText.replace(/^-\s*\[\s*\]\s*/, "");
    textSpan.textContent = displayText + " ";

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

    const titleSpan = header.createEl("span", {
      text: this.todonesCollapsed ? "▶" : "▼",
      cls: "collapse-icon",
    });

    titleSpan.appendText(` Recent TODONEs (${todones.length})`);
    titleSpan.addClass("todo-section-title");

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

    // Text content
    const textSpan = item.createEl("span", { cls: "todo-text todone-text" });
    const cleanText = todone.text.replace(/#todone\b/g, "").trim();
    const displayText = cleanText.replace(/^-\s*\[x\]\s*/, "");
    textSpan.textContent = displayText + " ";

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
