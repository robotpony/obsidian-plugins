import { App, TFile, Vault, Events } from "obsidian";
import { TodoItem } from "./types";
import { extractTags, hasCheckboxFormat } from "./utils";

export class TodoScanner extends Events {
  private app: App;
  private todosCache: Map<string, TodoItem[]> = new Map();
  private todonesCache: Map<string, TodoItem[]> = new Map();
  private excludeFromTodones: Set<string> = new Set();

  constructor(app: App) {
    super();
    this.app = app;
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

  private isInInlineCode(line: string): boolean {
    // Check if #todo or #todone appears within backticks
    // This handles inline code like `#todo` or `some code #todo here`

    // Find all #todo and #todone positions
    const todoMatches = [...line.matchAll(/#todo\b/g)];
    const todoneMatches = [...line.matchAll(/#todone\b/g)];
    const allMatches = [...todoMatches, ...todoneMatches];

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

    // Check if any #todo/#todone is between backtick pairs
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
    // Watch for file modifications
    this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.scanFile(file);
      }
    });

    // Watch for file creation
    this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.scanFile(file);
      }
    });

    // Watch for file deletion
    this.app.vault.on("delete", (file) => {
      if (file instanceof TFile) {
        this.todosCache.delete(file.path);
        this.todonesCache.delete(file.path);
      }
    });

    // Watch for file rename
    this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile && file.extension === "md") {
        this.todosCache.delete(oldPath);
        this.todonesCache.delete(oldPath);
        this.scanFile(file);
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
