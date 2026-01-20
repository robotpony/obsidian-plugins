import { App, TFile } from "obsidian";
import { TodoItem } from "./types";
import {
  formatDate,
  replaceTodoWithTodone,
  markCheckboxComplete,
  replaceTodoneWithTodo,
  markCheckboxIncomplete,
  removeIdeaTag,
  replaceIdeaWithTodo,
  showNotice,
} from "./utils";
import { TodoScanner } from "./TodoScanner";

export class TodoProcessor {
  private app: App;
  private dateFormat: string;
  private onComplete?: () => void;
  private scanner?: TodoScanner;

  constructor(app: App, dateFormat: string = "YYYY-MM-DD") {
    this.app = app;
    this.dateFormat = dateFormat;
  }

  setScanner(scanner: TodoScanner): void {
    this.scanner = scanner;
  }

  setOnCompleteCallback(callback: () => void): void {
    this.onComplete = callback;
  }

  async completeTodo(
    todo: TodoItem,
    todoneFilePath: string
  ): Promise<boolean> {
    try {
      const today = formatDate(new Date(), this.dateFormat);

      // If this is a header TODO with children, complete all children first
      if (todo.isHeader && todo.childLineNumbers && todo.childLineNumbers.length > 0) {
        await this.completeChildrenLines(todo.file, todo.childLineNumbers, today);
      }

      // Step 1: Update the source file (header or regular TODO)
      await this.updateSourceFile(todo, today);

      // Step 2: Append to TODONE log file
      await this.appendToTodoneFile(todo, todoneFilePath, today);

      // Step 3: Immediately rescan the file to update cache (don't wait for debounced watcher)
      if (this.scanner) {
        await this.scanner.scanFile(todo.file);
      }

      // Trigger callback if set
      if (this.onComplete) {
        this.onComplete();
      }

      const childCount = todo.childLineNumbers?.length || 0;
      const message = childCount > 0
        ? `TODO marked as complete! (including ${childCount} child item${childCount > 1 ? 's' : ''})`
        : "TODO marked as complete!";
      showNotice(message);
      return true;
    } catch (error) {
      console.error("Error completing TODO:", error);
      showNotice("Failed to complete TODO. See console for details.");
      return false;
    }
  }

  // Complete all child lines of a header TODO
  private async completeChildrenLines(file: TFile, lineNumbers: number[], date: string): Promise<void> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    // Process children (modify lines in place)
    for (const lineNum of lineNumbers) {
      if (lineNum >= lines.length) continue;

      let line = lines[lineNum];

      // Add #todone @date if not already present
      if (!line.includes('#todone')) {
        if (line.includes('#todo')) {
          line = replaceTodoWithTodone(line, date);
        } else {
          // Child item without explicit tag - add #todone @date
          line = line.trimEnd() + ` #todone @${date}`;
        }
      }

      // Mark checkbox if present
      if (/\[\s*\]/.test(line)) {
        line = markCheckboxComplete(line);
      }

      lines[lineNum] = line;
    }

    await this.app.vault.modify(file, lines.join("\n"));
  }

  async uncompleteTodo(todo: TodoItem): Promise<boolean> {
    try {
      // Update the source file - revert #todone @date to #todo
      await this.revertSourceFile(todo);

      // Note: We do NOT remove from the TODONE log file as it serves as history

      // Immediately rescan the file to update cache
      if (this.scanner) {
        await this.scanner.scanFile(todo.file);
      }

      // Trigger callback if set
      if (this.onComplete) {
        this.onComplete();
      }

      showNotice("TODO marked as incomplete!");
      return true;
    } catch (error) {
      console.error("Error uncompleting TODO:", error);
      showNotice("Failed to uncomplete TODO. See console for details.");
      return false;
    }
  }

  private async revertSourceFile(todo: TodoItem): Promise<void> {
    const content = await this.app.vault.read(todo.file);
    const lines = content.split("\n");

    if (todo.lineNumber >= lines.length) {
      throw new Error(
        `Line number ${todo.lineNumber} out of bounds for file ${todo.filePath}`
      );
    }

    let updatedLine = lines[todo.lineNumber];

    // Validate line content hasn't changed since scan (prevents modifying wrong line)
    if (!updatedLine.includes("#todone")) {
      throw new Error(
        `Line ${todo.lineNumber} in ${todo.filePath} no longer contains #todone tag. File may have been modified.`
      );
    }

    // Replace #todone (with optional @date) with #todo
    updatedLine = replaceTodoneWithTodo(updatedLine);

    // If it has a completed checkbox [x], mark it incomplete [ ]
    if (todo.hasCheckbox) {
      updatedLine = markCheckboxIncomplete(updatedLine);
    }

    lines[todo.lineNumber] = updatedLine;
    await this.app.vault.modify(todo.file, lines.join("\n"));
  }

  private async updateSourceFile(todo: TodoItem, date: string): Promise<void> {
    const content = await this.app.vault.read(todo.file);
    const lines = content.split("\n");

    if (todo.lineNumber >= lines.length) {
      throw new Error(
        `Line number ${todo.lineNumber} out of bounds for file ${todo.filePath}`
      );
    }

    let updatedLine = lines[todo.lineNumber];

    // Check if already completed
    if (updatedLine.includes("#todone")) {
      throw new Error(
        `Line ${todo.lineNumber} in ${todo.filePath} already contains #todone tag. File may have been modified.`
      );
    }

    // Handle child items that inherit from parent header (no explicit #todo tag)
    const isChildItem = todo.parentLineNumber !== undefined;

    if (updatedLine.includes("#todo")) {
      // Regular TODO with explicit tag - replace #todo with #todone @date
      updatedLine = replaceTodoWithTodone(updatedLine, date);
    } else if (isChildItem) {
      // Child item without explicit #todo tag - add #todone @date
      updatedLine = updatedLine.trimEnd() + ` #todone @${date}`;
    } else {
      throw new Error(
        `Line ${todo.lineNumber} in ${todo.filePath} no longer contains #todo tag. File may have been modified.`
      );
    }

    // If it has a checkbox, mark it complete
    if (todo.hasCheckbox) {
      updatedLine = markCheckboxComplete(updatedLine);
    }

    lines[todo.lineNumber] = updatedLine;
    await this.app.vault.modify(todo.file, lines.join("\n"));
  }

  private async appendToTodoneFile(
    todo: TodoItem,
    todoneFilePath: string,
    date: string
  ): Promise<void> {
    // Ensure the file exists
    let todoneFile = this.app.vault.getAbstractFileByPath(todoneFilePath);

    if (!todoneFile) {
      // Create the file (and parent folders if needed)
      const pathParts = todoneFilePath.split("/");
      const fileName = pathParts.pop();
      const folderPath = pathParts.join("/");

      if (folderPath) {
        await this.ensureFolderExists(folderPath);
      }

      todoneFile = await this.app.vault.create(todoneFilePath, "");
    }

    if (!(todoneFile instanceof TFile)) {
      throw new Error(`${todoneFilePath} is not a file`);
    }

    // Format the TODONE entry
    let todoneText = todo.text;

    // Strip heading markers from header TODOs (e.g., "## Task" -> "Task")
    if (todo.isHeader) {
      todoneText = todoneText.replace(/^#{1,6}\s+/, "");
    }

    todoneText = replaceTodoWithTodone(todoneText, date);

    // Ensure it has the completed checkbox format
    if (todo.hasCheckbox) {
      todoneText = markCheckboxComplete(todoneText);
    } else {
      // For plain text TODOs, prepend checkbox
      todoneText = `- [x] ${todoneText}`;
    }

    // Append to file
    const currentContent = await this.app.vault.read(todoneFile);
    const newContent = currentContent
      ? `${currentContent}\n${todoneText}`
      : todoneText;
    await this.app.vault.modify(todoneFile, newContent);
  }

  private async ensureFolderExists(folderPath: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }
  }

  async setPriorityTag(todo: TodoItem, newTag: string, addFocus: boolean = false): Promise<boolean> {
    try {
      const content = await this.app.vault.read(todo.file);
      const lines = content.split("\n");

      if (todo.lineNumber >= lines.length) {
        throw new Error(
          `Line number ${todo.lineNumber} out of bounds for file ${todo.filePath}`
        );
      }

      let line = lines[todo.lineNumber];

      // Validate line still contains #todo (prevents modifying wrong line)
      if (!line.includes("#todo") || line.includes("#todone")) {
        throw new Error(
          `Line ${todo.lineNumber} in ${todo.filePath} no longer contains #todo tag. File may have been modified.`
        );
      }

      // Remove existing priority tags (#p0-#p4, #future)
      line = line.replace(/#p[0-4]\b/g, "");
      line = line.replace(/#future\b/g, "");

      // Clean up extra whitespace
      line = line.replace(/\s+/g, " ").trim();

      // Add new priority tag at end
      line = line + ` ${newTag}`;

      // Add #focus tag if requested (and not already present)
      if (addFocus && !line.includes("#focus")) {
        line = line + " #focus";
      }

      lines[todo.lineNumber] = line;
      await this.app.vault.modify(todo.file, lines.join("\n"));

      // Immediately rescan the file to update cache
      if (this.scanner) {
        await this.scanner.scanFile(todo.file);
      }

      // Trigger callback if set
      if (this.onComplete) {
        this.onComplete();
      }

      showNotice(`Priority set to ${newTag}${addFocus ? " + #focus" : ""}`);
      return true;
    } catch (error) {
      console.error("Error setting priority:", error);
      showNotice("Failed to set priority. See console for details.");
      return false;
    }
  }

  async removeTag(todo: TodoItem, tag: string): Promise<boolean> {
    try {
      const content = await this.app.vault.read(todo.file);
      const lines = content.split("\n");

      if (todo.lineNumber >= lines.length) {
        throw new Error(
          `Line number ${todo.lineNumber} out of bounds for file ${todo.filePath}`
        );
      }

      let line = lines[todo.lineNumber];

      // Remove the specified tag
      const tagPattern = new RegExp(`${tag}\\b\\s*`, "g");
      line = line.replace(tagPattern, "");

      // Clean up extra whitespace
      line = line.replace(/\s+/g, " ").trim();

      lines[todo.lineNumber] = line;
      await this.app.vault.modify(todo.file, lines.join("\n"));

      // Immediately rescan the file to update cache
      if (this.scanner) {
        await this.scanner.scanFile(todo.file);
      }

      // Trigger callback if set
      if (this.onComplete) {
        this.onComplete();
      }

      showNotice(`Removed ${tag}`);
      return true;
    } catch (error) {
      console.error("Error removing tag:", error);
      showNotice("Failed to remove tag. See console for details.");
      return false;
    }
  }

  async completeIdea(idea: TodoItem): Promise<boolean> {
    try {
      const content = await this.app.vault.read(idea.file);
      const lines = content.split("\n");

      if (idea.lineNumber >= lines.length) {
        throw new Error(
          `Line number ${idea.lineNumber} out of bounds for file ${idea.filePath}`
        );
      }

      let line = lines[idea.lineNumber];

      // Validate line still contains #idea, #ideas, or #ideation
      if (!/#idea(?:s|tion)?\b/.test(line)) {
        throw new Error(
          `Line ${idea.lineNumber} in ${idea.filePath} no longer contains #idea/#ideas/#ideation tag. File may have been modified.`
        );
      }

      // Remove #idea/#ideas/#ideation tag (idea disappears from sidebar)
      line = removeIdeaTag(line);

      lines[idea.lineNumber] = line;
      await this.app.vault.modify(idea.file, lines.join("\n"));

      // Immediately rescan the file to update cache
      if (this.scanner) {
        await this.scanner.scanFile(idea.file);
      }

      // Trigger callback if set
      if (this.onComplete) {
        this.onComplete();
      }

      showNotice("Idea completed!");
      return true;
    } catch (error) {
      console.error("Error completing idea:", error);
      showNotice("Failed to complete idea. See console for details.");
      return false;
    }
  }

  async convertIdeaToTodo(idea: TodoItem): Promise<boolean> {
    try {
      const content = await this.app.vault.read(idea.file);
      const lines = content.split("\n");

      if (idea.lineNumber >= lines.length) {
        throw new Error(
          `Line number ${idea.lineNumber} out of bounds for file ${idea.filePath}`
        );
      }

      let line = lines[idea.lineNumber];

      // Validate line still contains #idea, #ideas, or #ideation
      if (!/#idea(?:s|tion)?\b/.test(line)) {
        throw new Error(
          `Line ${idea.lineNumber} in ${idea.filePath} no longer contains #idea/#ideas/#ideation tag. File may have been modified.`
        );
      }

      // Replace #idea/#ideas/#ideation with #todo
      line = replaceIdeaWithTodo(line);

      lines[idea.lineNumber] = line;
      await this.app.vault.modify(idea.file, lines.join("\n"));

      // Immediately rescan the file to update cache
      if (this.scanner) {
        await this.scanner.scanFile(idea.file);
      }

      // Trigger callback if set
      if (this.onComplete) {
        this.onComplete();
      }

      showNotice("Idea promoted to TODO!");
      return true;
    } catch (error) {
      console.error("Error converting idea to TODO:", error);
      showNotice("Failed to convert idea. See console for details.");
      return false;
    }
  }

  async addFocusToIdea(idea: TodoItem): Promise<boolean> {
    try {
      const content = await this.app.vault.read(idea.file);
      const lines = content.split("\n");

      if (idea.lineNumber >= lines.length) {
        throw new Error(
          `Line number ${idea.lineNumber} out of bounds for file ${idea.filePath}`
        );
      }

      let line = lines[idea.lineNumber];

      // Add #focus tag if not already present
      if (!line.includes("#focus")) {
        line = line.trimEnd() + " #focus";
      }

      lines[idea.lineNumber] = line;
      await this.app.vault.modify(idea.file, lines.join("\n"));

      // Immediately rescan the file to update cache
      if (this.scanner) {
        await this.scanner.scanFile(idea.file);
      }

      // Trigger callback if set
      if (this.onComplete) {
        this.onComplete();
      }

      showNotice("Idea focused!");
      return true;
    } catch (error) {
      console.error("Error focusing idea:", error);
      showNotice("Failed to focus idea. See console for details.");
      return false;
    }
  }
}
