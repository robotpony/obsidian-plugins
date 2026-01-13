import { App, TFile, Vault, Events, debounce } from "obsidian";
import { TodoItem } from "./types";
import { extractTags, hasCheckboxFormat } from "./utils";

export class TodoScanner extends Events {
  private app: App;
  private todosCache: Map<string, TodoItem[]> = new Map();
  private todonesCache: Map<string, TodoItem[]> = new Map();
  private excludeFromTodones: Set<string> = new Set();

  // Debounced scan function to prevent rapid re-scans on file changes
  private debouncedScanFile: (file: TFile) => void;

  constructor(app: App) {
    super();
    this.app = app;

    // Debounce file scans to 100ms to prevent rapid consecutive scans
    this.debouncedScanFile = debounce(
      (file: TFile) => this.scanFile(file),
      100,
      true
    );
  }

  setExcludeFromTodones(filePaths: string[]): void {
    this.excludeFromTodones = new Set(filePaths);
  }

  async scanVault(): Promise<void> {
    this.todosCache.clear();
    this.todonesCache.clear();

    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      await this.scanFile(file);
    }
  }

  async scanFile(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const todos: TodoItem[] = [];
      const todones: TodoItem[] = [];
      const linesToCleanup: number[] = [];

      // Track code block state
      let inCodeBlock = false;

      // Track current header TODO context for parent-child relationships
      let currentHeaderTodo: { lineNumber: number; level: number; todoItem: TodoItem } | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for triple backtick code blocks
        if (line.trim().startsWith("```")) {
          inCodeBlock = !inCodeBlock;
          continue;
        }

        // Skip lines inside code blocks
        if (inCodeBlock) {
          continue;
        }

        // Skip lines with inline code containing #todo or #todone
        if (this.isInInlineCode(line)) {
          continue;
        }

        const tags = extractTags(line);

        // Check if this is a header with #todo or #todone
        const headerInfo = this.detectHeader(line);

        // If we encounter any header (with or without tags), check if it ends current header scope
        if (headerInfo && currentHeaderTodo) {
          if (headerInfo.level <= currentHeaderTodo.level) {
            currentHeaderTodo = null;
          }
        }

        // Process header with #todo tag
        if (headerInfo && tags.includes("#todo") && !tags.includes("#todone")) {
          const headerTodo = this.createTodoItem(file, i, line, tags);
          headerTodo.isHeader = true;
          headerTodo.headerLevel = headerInfo.level;
          headerTodo.childLineNumbers = [];
          todos.push(headerTodo);
          currentHeaderTodo = { lineNumber: i, level: headerInfo.level, todoItem: headerTodo };
          continue;
        }

        // Process header with #todone tag
        if (headerInfo && tags.includes("#todone")) {
          const headerTodone = this.createTodoItem(file, i, line, tags);
          headerTodone.isHeader = true;
          headerTodone.headerLevel = headerInfo.level;
          todones.push(headerTodone);
          // Reset header context since this header is completed
          currentHeaderTodo = null;
          continue;
        }

        // If we're under a header TODO and this is a list item, treat as child
        if (currentHeaderTodo && this.isListItem(line)) {
          const childItem = this.createTodoItem(file, i, line, tags);
          childItem.parentLineNumber = currentHeaderTodo.lineNumber;
          // Add this line number to parent's children
          currentHeaderTodo.todoItem.childLineNumbers!.push(i);

          // Add child to appropriate list based on its own tags
          if (tags.includes("#todone")) {
            todones.push(childItem);
          } else {
            // Child items don't need explicit #todo tag - they inherit from parent
            todos.push(childItem);
          }
          continue;
        }

        // Regular TODO/TODONE processing (non-header, non-child items)
        // If line has both #todo and #todone, #todone wins and we clean up the #todo
        if (tags.includes("#todone") && tags.includes("#todo")) {
          // Queue this line for cleanup (remove #todo tag)
          linesToCleanup.push(i);
          // Treat as completed
          todones.push(this.createTodoItem(file, i, line, tags));
        } else if (tags.includes("#todo")) {
          todos.push(this.createTodoItem(file, i, line, tags));
        } else if (tags.includes("#todone")) {
          todones.push(this.createTodoItem(file, i, line, tags));
        }
      }

      // Clean up lines that have both #todo and #todone
      if (linesToCleanup.length > 0) {
        this.cleanupDuplicateTags(file, lines, linesToCleanup);
      }

      if (todos.length > 0) {
        this.todosCache.set(file.path, todos);
      } else {
        this.todosCache.delete(file.path);
      }

      if (todones.length > 0) {
        this.todonesCache.set(file.path, todones);
      } else {
        this.todonesCache.delete(file.path);
      }

      // Emit update event so UI can refresh
      this.trigger("todos-updated");
    } catch (error) {
      console.error(`Error scanning file ${file.path}:`, error);
    }
  }

  // Detect markdown header and return its level
  private detectHeader(line: string): { level: number } | null {
    const match = line.match(/^(#{1,6})\s+/);
    if (match) {
      return { level: match[1].length };
    }
    return null;
  }

  // Check if a line is a list item (bullet or numbered)
  private isListItem(line: string): boolean {
    // Match: "- ", "* ", "+ ", "1. ", "  - " (indented), etc.
    return /^[\s]*[-*+]\s/.test(line) || /^[\s]*\d+\.\s/.test(line);
  }

  private isInInlineCode(line: string): boolean {
    // Check if #todo, #todone, or #focus appears within backticks
    // This handles inline code like `#todo` or `some code #focus here`

    // Find all #todo, #todone, and #focus positions
    const todoMatches = [...line.matchAll(/#todo\b/g)];
    const todoneMatches = [...line.matchAll(/#todone\b/g)];
    const focusMatches = [...line.matchAll(/#focus\b/g)];
    const allMatches = [...todoMatches, ...todoneMatches, ...focusMatches];

    if (allMatches.length === 0) {
      return false;
    }

    // Find all backtick pairs
    const backticks: number[] = [];
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '`') {
        backticks.push(i);
      }
    }

    // If odd number of backticks, the line is malformed, treat conservatively
    if (backticks.length % 2 !== 0) {
      return false;
    }

    // Check if any #todo/#todone/#focus is between backtick pairs
    for (const match of allMatches) {
      const pos = match.index!;

      // Check all backtick pairs
      for (let i = 0; i < backticks.length; i += 2) {
        const start = backticks[i];
        const end = backticks[i + 1];

        if (pos > start && pos < end) {
          return true; // Found a tag inside inline code
        }
      }
    }

    return false;
  }

  private createTodoItem(
    file: TFile,
    lineNumber: number,
    text: string,
    tags: string[]
  ): TodoItem {
    return {
      file,
      filePath: file.path,
      folder: file.parent?.path || "",
      lineNumber,
      text: text.trim(),
      hasCheckbox: hasCheckboxFormat(text),
      tags,
      dateCreated: file.stat.mtime,
    };
  }

  getTodos(): TodoItem[] {
    const allTodos: TodoItem[] = [];
    for (const todos of this.todosCache.values()) {
      allTodos.push(...todos);
    }
    // Sort by date created (oldest first)
    return allTodos.sort((a, b) => a.dateCreated - b.dateCreated);
  }

  getTodones(limit?: number): TodoItem[] {
    const allTodones: TodoItem[] = [];
    for (const [filePath, todones] of this.todonesCache.entries()) {
      // Skip files that are in the exclude list
      if (this.excludeFromTodones.has(filePath)) {
        continue;
      }
      allTodones.push(...todones);
    }
    // Sort by date created (newest first for recent items)
    const sorted = allTodones.sort((a, b) => b.dateCreated - a.dateCreated);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  watchFiles(): void {
    // Watch for file modifications (debounced to prevent rapid re-scans)
    this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.debouncedScanFile(file);
      }
    });

    // Watch for file creation (debounced)
    this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.debouncedScanFile(file);
      }
    });

    // Watch for file deletion (immediate - no debounce needed)
    this.app.vault.on("delete", (file) => {
      if (file instanceof TFile) {
        this.todosCache.delete(file.path);
        this.todonesCache.delete(file.path);
        this.trigger("todos-updated");
      }
    });

    // Watch for file rename (debounced scan for new path)
    this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile && file.extension === "md") {
        this.todosCache.delete(oldPath);
        this.todonesCache.delete(oldPath);
        this.debouncedScanFile(file);
      }
    });
  }

  // Clean up lines that have both #todo and #todone (remove #todo)
  private async cleanupDuplicateTags(
    file: TFile,
    lines: string[],
    lineNumbers: number[]
  ): Promise<void> {
    let modified = false;

    for (const lineNum of lineNumbers) {
      // Remove #todo tag from lines that also have #todone
      const newLine = lines[lineNum].replace(/#todo\b\s*/g, "");
      if (newLine !== lines[lineNum]) {
        lines[lineNum] = newLine;
        modified = true;
      }
    }

    if (modified) {
      await this.app.vault.modify(file, lines.join("\n"));
    }
  }
}
