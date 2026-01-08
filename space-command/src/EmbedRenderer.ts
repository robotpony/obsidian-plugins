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
  // Uses DOM methods to avoid XSS vulnerabilities
  private renderInlineMarkdown(text: string, container: HTMLElement): void {
    // Process markdown inline syntax (bold, italic, links)
    // This avoids the extra <p> tags that MarkdownRenderer adds

    // Parse markdown tokens
    const tokens = this.parseMarkdownTokens(text);

    // Render tokens as DOM elements
    for (const token of tokens) {
      switch (token.type) {
        case 'text':
          container.appendText(token.content);
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
