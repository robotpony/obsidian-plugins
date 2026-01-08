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

  // Public helper method for code block processor
  // Renders a TODO list with filters
  public renderTodos(
    container: HTMLElement,
    filterString: string,
    todoneFile: string
  ): void {
    const filters = FilterParser.parse(filterString);
    let todos = this.scanner.getTodos();
    todos = FilterParser.applyFilters(todos, filters);
    this.renderTodoList(container, todos, todoneFile);
  }

  // Public helper method for focus-list code blocks
  public renderProjects(container: HTMLElement): void {
    this.renderFocusList(container);
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
      let displayText = cleanText.replace(/^-\s*\[\s*\]\s*/, "");
      // Remove block-level markdown markers (list bullets, quotes)
      displayText = displayText
        .replace(/^[*\-+]\s+/, "")  // Remove list markers
        .replace(/^>\s+/, "");       // Remove quote markers

      // Render inline markdown manually to avoid extra <p> tags
      this.renderInlineMarkdown(displayText, textSpan);
      textSpan.append(" ");

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

  // Render inline markdown without creating block elements
  private renderInlineMarkdown(text: string, container: HTMLElement): void {
    // Process markdown inline syntax (bold, italic, links)
    // This avoids the extra <p> tags that MarkdownRenderer adds

    let html = text;

    // Bold: **text** or __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_ (but not inside words)
    html = html.replace(/\*([^\s*][^*]*?)\*/g, '<em>$1</em>');
    html = html.replace(/\b_([^_]+?)_\b/g, '<em>$1</em>');

    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Code: `text`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Set the HTML content
    container.innerHTML = html;
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
