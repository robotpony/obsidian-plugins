import { App, MarkdownPostProcessorContext } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { TodoProcessor } from "./TodoProcessor";
import { ProjectManager } from "./ProjectManager";
import { FilterParser } from "./FilterParser";
import { TodoItem } from "./types";

export class EmbedRenderer {
  private app: App;
  private scanner: TodoScanner;
  private processor: TodoProcessor;
  private projectManager: ProjectManager;
  private defaultTodoneFile: string;
  private focusListLimit: number;

  constructor(
    app: App,
    scanner: TodoScanner,
    processor: TodoProcessor,
    projectManager: ProjectManager,
    defaultTodoneFile: string = "todos/done.md",
    focusListLimit: number = 5
  ) {
    this.app = app;
    this.scanner = scanner;
    this.processor = processor;
    this.projectManager = projectManager;
    this.defaultTodoneFile = defaultTodoneFile;
    this.focusListLimit = focusListLimit;
  }

  async render(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> {
    // Check if this is a focus-list embed
    const focusListMatch = source.match(/\{\{focus-list\}\}/);
    if (focusListMatch) {
      this.renderFocusList(el);
      return;
    }

    // Parse the embed syntax: {{focus-todos: [todone-file] | [filters]}}
    // Both todone-file and filters are optional
    const match = source.match(
      /\{\{focus-todos:?\s*([^|}\s]*)(?:\s*\|\s*(.+))?\}\}/
    );

    if (!match) {
      el.createEl("div", {
        text: "Invalid syntax (use {{focus-todos}} or {{focus-list}})",
        cls: "space-command-error",
      });
      return;
    }

    // Use provided file or default
    const todoneFile = match[1]?.trim() || this.defaultTodoneFile;
    const filterString = match[2] || "";

    // Parse filters
    const filters = FilterParser.parse(filterString);

    // Get todos and apply filters
    let todos = this.scanner.getTodos();
    todos = FilterParser.applyFilters(todos, filters);

    // Render the todo list
    this.renderTodoList(el, todos, todoneFile);
  }

  private renderFocusList(container: HTMLElement): void {
    container.empty();
    container.addClass("space-command-embed", "focus-list-embed");

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

  private renderTodoList(
    container: HTMLElement,
    todos: TodoItem[],
    todoneFile: string
  ): void {
    container.empty();
    container.addClass("space-command-embed");

    if (todos.length === 0) {
      container.createEl("div", {
        text: "No active TODOs",
        cls: "space-command-empty",
      });
      return;
    }

    const list = container.createEl("ul", { cls: "contains-task-list" });

    for (const todo of todos) {
      const item = list.createEl("li", { cls: "task-list-item" });

      // Create checkbox
      const checkbox = item.createEl("input", {
        type: "checkbox",
        cls: "task-list-item-checkbox",
      });

      checkbox.addEventListener("change", async () => {
        checkbox.disabled = true;
        const success = await this.processor.completeTodo(todo, todoneFile);
        if (success) {
          // Remove the item from the list
          item.remove();
          // If no more items, show empty state
          if (list.children.length === 0) {
            container.empty();
            container.createEl("div", {
              text: "No active TODOs",
              cls: "space-command-empty",
            });
          }
        } else {
          checkbox.disabled = false;
        }
      });

      // Add todo text (without the #todo tag)
      const textSpan = item.createEl("span", { cls: "todo-text" });
      const cleanText = todo.text.replace(/#todo\b/g, "").trim();
      // Remove leading checkbox if present
      const displayText = cleanText.replace(/^-\s*\[\s*\]\s*/, "");
      textSpan.textContent = displayText + " ";

      // Add link to source
      const link = item.createEl("a", {
        text: "→",
        cls: "todo-source-link",
        href: "#",
      });

      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.openFileAtLine(todo.file, todo.lineNumber);
      });
    }
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
