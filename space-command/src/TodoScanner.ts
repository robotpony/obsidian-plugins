import { App, TFile, Vault, Events, debounce } from "obsidian";
import { TodoItem } from "./types";
import { extractTags, filenameToTag, hasCheckboxFormat, isCheckboxChecked } from "./utils";

export class TodoScanner extends Events {
  private app: App;
  private todosCache: Map<string, TodoItem[]> = new Map();
  private todonesCache: Map<string, TodoItem[]> = new Map();
  private ideasCache: Map<string, TodoItem[]> = new Map();
  private principlesCache: Map<string, TodoItem[]> = new Map();
  private excludeFiles: Set<string> = new Set();

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

  setExcludeFiles(filePaths: string[]): void {
    this.excludeFiles = new Set(filePaths);
  }

  async scanVault(): Promise<void> {
    this.todosCache.clear();
    this.todonesCache.clear();
    this.ideasCache.clear();
    this.principlesCache.clear();

    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      await this.scanFile(file);
    }

    // Emit final event after full scan completes, ensuring any listeners
    // registered after scanVault() returns will have data available
    this.trigger("todos-updated");
  }

  async scanFile(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const todos: TodoItem[] = [];
      const todones: TodoItem[] = [];
      const ideas: TodoItem[] = [];
      const principles: TodoItem[] = [];
      const linesToCleanup: number[] = [];
      const linesToSyncTodone: number[] = [];

      // Track code block state
      let inCodeBlock = false;

      // Track current header context for parent-child relationships
      let currentHeaderTodo: { lineNumber: number; level: number; todoItem: TodoItem } | null = null;
      let currentHeaderIdea: { lineNumber: number; level: number; todoItem: TodoItem } | null = null;
      let currentHeaderPrinciple: { lineNumber: number; level: number; todoItem: TodoItem } | null = null;

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

        // Any header (with or without tags) ends all current header scopes
        // This ensures only direct list items (before any sub-header) become children
        if (headerInfo) {
          currentHeaderTodo = null;
          currentHeaderIdea = null;
          currentHeaderPrinciple = null;
        }

        // Process header with #todo or #todos tag
        if (headerInfo && (tags.includes("#todo") || tags.includes("#todos")) && !tags.includes("#todone") && !tags.includes("#todones")) {
          // Skip empty headers (just tag, no content)
          if (!this.hasContent(line)) continue;
          const headerTodo = this.createTodoItem(file, i, line, tags, 'todo');
          headerTodo.isHeader = true;
          headerTodo.headerLevel = headerInfo.level;
          headerTodo.childLineNumbers = [];
          todos.push(headerTodo);
          currentHeaderTodo = { lineNumber: i, level: headerInfo.level, todoItem: headerTodo };
          continue;
        }

        // Process header with #todone or #todones tag
        if (headerInfo && (tags.includes("#todone") || tags.includes("#todones"))) {
          // Skip empty headers (just tag, no content)
          if (!this.hasContent(line)) continue;
          const headerTodone = this.createTodoItem(file, i, line, tags, 'todone');
          headerTodone.isHeader = true;
          headerTodone.headerLevel = headerInfo.level;
          todones.push(headerTodone);
          // Reset header context since this header is completed
          currentHeaderTodo = null;
          continue;
        }

        // If we're under a header TODO and this is a list item, treat as child
        if (currentHeaderTodo && this.isListItem(line)) {
          // Skip items with #idea tags - they should only appear in ideas, not todos
          const hasIdeaTag = tags.includes("#idea") || tags.includes("#ideas") || tags.includes("#ideation");
          if (hasIdeaTag) {
            // Don't add to todo children, let idea processing handle it
            continue;
          }

          // Skip items with #principle tags - they should only appear in principles, not todos
          const hasPrincipleTag = tags.includes("#principle") || tags.includes("#principles");
          if (hasPrincipleTag) {
            // Don't add to todo children, let principle processing handle it below
            // Don't continue - fall through to principle processing
          } else {
            // Regular TODO child processing

            // Check if checkbox is checked but missing #todone tag - sync the state
            const isChecked = isCheckboxChecked(line);
            const hasTodoneTag = tags.includes("#todone");

            if (isChecked && !hasTodoneTag) {
              // Queue this line to add #todone tag (sync checkbox state)
              linesToSyncTodone.push(i);
              // Treat as completed for this scan
              tags.push("#todone");
            }

            // Skip empty child items
            if (!this.hasContent(line)) continue;

            const childItemType = tags.includes("#todone") ? 'todone' : 'todo';
            const childItem = this.createTodoItem(file, i, line, tags, childItemType);
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
        }

        // Regular TODO/TODONE processing (non-header, non-child items)
        // If line has both #todo and #todone, #todone wins and we clean up the #todo
        // If line has #idea, it should not appear in todos (idea takes precedence)
        const hasTodo = tags.includes("#todo") || tags.includes("#todos");
        const hasTodone = tags.includes("#todone") || tags.includes("#todones");
        const hasIdea = tags.includes("#idea") || tags.includes("#ideas") || tags.includes("#ideation");
        // Skip empty items (just tags, no content)
        const lineHasContent = this.hasContent(line);
        if (hasTodone && hasTodo) {
          // Queue this line for cleanup (remove #todo tag)
          linesToCleanup.push(i);
          // Treat as completed (only if has content)
          if (lineHasContent) todones.push(this.createTodoItem(file, i, line, tags, 'todone'));
        } else if (hasTodo && !hasIdea) {
          // Only add to todos if not tagged as idea and has content
          if (lineHasContent) todos.push(this.createTodoItem(file, i, line, tags, 'todo'));
        } else if (hasTodone) {
          if (lineHasContent) todones.push(this.createTodoItem(file, i, line, tags, 'todone'));
        }

        // Idea processing - handle headers with children
        if (tags.includes("#idea") || tags.includes("#ideas") || tags.includes("#ideation")) {
          // Skip empty ideas
          if (!lineHasContent) continue;
          if (headerInfo) {
            // Header with #idea tag
            const headerIdea = this.createTodoItem(file, i, line, tags, 'idea');
            headerIdea.isHeader = true;
            headerIdea.headerLevel = headerInfo.level;
            headerIdea.childLineNumbers = [];
            ideas.push(headerIdea);
            currentHeaderIdea = { lineNumber: i, level: headerInfo.level, todoItem: headerIdea };
          } else {
            // Regular idea (not a header)
            ideas.push(this.createTodoItem(file, i, line, tags, 'idea'));
          }
        } else if (currentHeaderIdea && this.isListItem(line) && !tags.includes("#todo") && !tags.includes("#todone")) {
          // Child item under a header idea (only if not already a todo/todone)
          // Skip empty children
          if (!this.hasContent(line)) continue;
          const childItem = this.createTodoItem(file, i, line, tags, 'idea');
          childItem.parentLineNumber = currentHeaderIdea.lineNumber;
          currentHeaderIdea.todoItem.childLineNumbers!.push(i);
          ideas.push(childItem);
        }

        // Principle processing - handle headers with children
        if (tags.includes("#principle") || tags.includes("#principles")) {
          // Skip empty principles
          if (!lineHasContent) continue;
          if (headerInfo) {
            // Header with #principle tag
            const headerPrinciple = this.createTodoItem(file, i, line, tags, 'principle');
            headerPrinciple.isHeader = true;
            headerPrinciple.headerLevel = headerInfo.level;
            headerPrinciple.childLineNumbers = [];
            principles.push(headerPrinciple);
            currentHeaderPrinciple = { lineNumber: i, level: headerInfo.level, todoItem: headerPrinciple };
          } else {
            // Regular principle (not a header)
            principles.push(this.createTodoItem(file, i, line, tags, 'principle'));
          }
        } else if (currentHeaderPrinciple && this.isListItem(line) && !tags.includes("#todo") && !tags.includes("#todone") && !tags.includes("#idea") && !tags.includes("#ideas") && !tags.includes("#ideation")) {
          // Child item under a header principle (only if not already another type)
          // Skip empty children
          if (!this.hasContent(line)) continue;
          const childItem = this.createTodoItem(file, i, line, tags, 'principle');
          childItem.parentLineNumber = currentHeaderPrinciple.lineNumber;
          currentHeaderPrinciple.todoItem.childLineNumbers!.push(i);
          principles.push(childItem);
        }
      }

      // Clean up lines that have both #todo and #todone
      if (linesToCleanup.length > 0) {
        this.cleanupDuplicateTags(file, lines, linesToCleanup);
      }

      // Sync checked checkboxes by adding #todone tag
      if (linesToSyncTodone.length > 0) {
        this.syncCheckedCheckboxes(file, lines, linesToSyncTodone);
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

      if (ideas.length > 0) {
        this.ideasCache.set(file.path, ideas);
      } else {
        this.ideasCache.delete(file.path);
      }

      if (principles.length > 0) {
        this.principlesCache.set(file.path, principles);
      } else {
        this.principlesCache.delete(file.path);
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
    // Check if #todo, #todone, #idea, #principle, or #focus appears within backticks
    // This handles inline code like `#todo` or `some code #focus here`

    // Find all tag positions (including plural forms)
    const todoMatches = [...line.matchAll(/#todos?\b/g)];
    const todoneMatches = [...line.matchAll(/#todones?\b/g)];
    const ideaMatches = [...line.matchAll(/#idea(?:s|tion)?\b/g)];
    const principleMatches = [...line.matchAll(/#principles?\b/g)];
    const focusMatches = [...line.matchAll(/#focus\b/g)];
    const allMatches = [...todoMatches, ...todoneMatches, ...ideaMatches, ...principleMatches, ...focusMatches];

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
    tags: string[],
    itemType?: 'todo' | 'todone' | 'idea' | 'principle'
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
      itemType,
      inferredFileTag: filenameToTag(file.basename),
    };
  }

  /**
   * Check if a line has meaningful content beyond tags and markers.
   * Returns false for empty items like "- [ ] #todo" or "- #idea  "
   */
  private hasContent(text: string): boolean {
    let content = text.trim();
    // Remove header markers (e.g., #### )
    content = content.replace(/^#{1,6}\s*/, '');
    // Remove list markers (e.g., "- ", "* ", "1. ")
    content = content.replace(/^[-*]\s*/, '');
    content = content.replace(/^\d+\.\s*/, '');
    // Remove checkbox markers (e.g., "[ ] ", "[x] ")
    content = content.replace(/^\[[ xX]?\]\s*/, '');
    // Remove all tags (e.g., #todo, #focus, #project-name)
    content = content.replace(/#[\w-]+/g, '');
    // Remove dates (e.g., @2026-01-28)
    content = content.replace(/@\d{4}-\d{2}-\d{2}/g, '');
    // Remove block link references (e.g., ^block-id)
    content = content.replace(/\^[\w-]+/g, '');
    // Check if anything meaningful remains
    return content.trim().length > 0;
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
      // Skip excluded files (e.g., the archive file)
      if (this.excludeFiles.has(filePath)) {
        continue;
      }
      allTodones.push(...todones);
    }
    // Sort by date created (newest first for recent items)
    const sorted = allTodones.sort((a, b) => b.dateCreated - a.dateCreated);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getIdeas(): TodoItem[] {
    const allIdeas: TodoItem[] = [];
    for (const [filePath, ideas] of this.ideasCache.entries()) {
      // Skip excluded files (e.g., the archive file)
      if (this.excludeFiles.has(filePath)) {
        continue;
      }
      allIdeas.push(...ideas);
    }
    // Sort by date created (oldest first)
    return allIdeas.sort((a, b) => a.dateCreated - b.dateCreated);
  }

  getPrinciples(): TodoItem[] {
    const allPrinciples: TodoItem[] = [];
    for (const [filePath, principles] of this.principlesCache.entries()) {
      // Skip excluded files (e.g., the archive file)
      if (this.excludeFiles.has(filePath)) {
        continue;
      }
      allPrinciples.push(...principles);
    }
    // Sort by date created (oldest first)
    return allPrinciples.sort((a, b) => a.dateCreated - b.dateCreated);
  }

  watchFiles(): void {
    // Watch for file modifications (debounced to prevent rapid re-scans)
    this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.debouncedScanFile(file);
      }
    });

    // Watch for metadata cache changes - fires more reliably for external file changes
    // (e.g., when files are modified by another editor, git operations, or sync services)
    this.app.metadataCache.on("changed", (file) => {
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
        this.ideasCache.delete(file.path);
        this.principlesCache.delete(file.path);
        this.trigger("todos-updated");
      }
    });

    // Watch for file rename (debounced scan for new path)
    this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile && file.extension === "md") {
        this.todosCache.delete(oldPath);
        this.todonesCache.delete(oldPath);
        this.ideasCache.delete(oldPath);
        this.principlesCache.delete(oldPath);
        this.debouncedScanFile(file);
      }
    });
  }

  // Clean up lines that have both #todo/#todos and #todone/#todones (remove #todo/#todos)
  private async cleanupDuplicateTags(
    file: TFile,
    lines: string[],
    lineNumbers: number[]
  ): Promise<void> {
    let modified = false;

    for (const lineNum of lineNumbers) {
      // Remove #todo or #todos tag from lines that also have #todone/#todones
      // Use #todos? to match both singular and plural forms
      const newLine = lines[lineNum].replace(/#todos?\b\s*/g, "");
      if (newLine !== lines[lineNum]) {
        lines[lineNum] = newLine;
        modified = true;
      }
    }

    if (modified) {
      await this.app.vault.modify(file, lines.join("\n"));
    }
  }

  // Sync checked checkboxes (- [x]) by adding #todone tag with date
  private async syncCheckedCheckboxes(
    file: TFile,
    lines: string[],
    lineNumbers: number[]
  ): Promise<void> {
    let modified = false;
    const today = new Date().toISOString().split("T")[0];

    for (const lineNum of lineNumbers) {
      const line = lines[lineNum];
      // Add #todone @date at end of line (before any trailing whitespace)
      const newLine = line.trimEnd() + ` #todone @${today}`;
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
