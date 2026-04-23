import { App, TFile } from "obsidian";
import { TodoItem } from "./types";
import {
  formatDate,
  modifyFileLine,
  replaceTodoWithTodone,
  replaceTodoWithMoved,
  markCheckboxComplete,
  replaceTodoneWithTodo,
  markCheckboxIncomplete,
  removeIdeaTag,
  replaceIdeaWithTodo,
  showNotice,
  compareByStatusAndDate,
} from "./utils";
import { TodoScanner } from "./TodoScanner";

export class TodoProcessor {
  private app: App;
  private dateFormat: string;
  private onComplete?: () => void;
  private onMoveHistoryUpdate?: (path: string) => void;
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

  setOnMoveHistoryUpdate(callback: (path: string) => void): void {
    this.onMoveHistoryUpdate = callback;
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

  /**
   * Move a TODO from its current file to a destination file.
   * Source line gets #todo → #moved @date; destination gets a fresh #todo copy.
   * Header TODOs move with all their children as a block.
   */
  async moveTodo(todo: TodoItem, destinationPath: string): Promise<boolean> {
    try {
      if (todo.filePath === destinationPath) {
        showNotice("Cannot move to the same file.");
        return false;
      }

      const today = formatDate(new Date(), this.dateFormat);

      // Collect lines to move (header + children, or single item)
      const sourceContent = await this.app.vault.read(todo.file);
      const sourceLines = sourceContent.split("\n");

      const lineNumbers = [todo.lineNumber];
      if (todo.isHeader && todo.childLineNumbers && todo.childLineNumbers.length > 0) {
        lineNumbers.push(...todo.childLineNumbers);
      }
      lineNumbers.sort((a, b) => a - b);

      // Build the text block for the destination (fresh #todo copies)
      const destLines: string[] = [];
      for (const lineNum of lineNumbers) {
        if (lineNum < 0 || lineNum >= sourceLines.length) continue;
        destLines.push(sourceLines[lineNum]);
      }

      // Append to destination file
      await this.appendToDestination(destinationPath, destLines.join("\n"));

      // Mark source lines as #moved @date
      for (const lineNum of lineNumbers) {
        if (lineNum < 0 || lineNum >= sourceLines.length) continue;
        let line = sourceLines[lineNum];
        if (line.includes("#todo")) {
          line = replaceTodoWithMoved(line, today);
        } else {
          // Child item without explicit #todo tag — append #moved @date
          line = line.trimEnd() + ` #moved @${today}`;
        }
        sourceLines[lineNum] = line;
      }
      await this.app.vault.modify(todo.file, sourceLines.join("\n"));

      // Rescan both files
      if (this.scanner) {
        await this.scanner.scanFile(todo.file);
        const destFile = this.app.vault.getAbstractFileByPath(destinationPath);
        if (destFile instanceof TFile) {
          await this.scanner.scanFile(destFile);
        }
      }

      // Record move target in history
      if (this.onMoveHistoryUpdate) {
        this.onMoveHistoryUpdate(destinationPath);
      }

      if (this.onComplete) {
        this.onComplete();
      }

      const basename = destinationPath.split("/").pop()?.replace(/\.md$/, "") || destinationPath;
      const childCount = (todo.isHeader && todo.childLineNumbers?.length) || 0;
      const message = childCount > 0
        ? `Moved to ${basename} (including ${childCount} child item${childCount > 1 ? 's' : ''})`
        : `Moved to ${basename}`;
      showNotice(message);
      return true;
    } catch (error) {
      console.error("Error moving TODO:", error);
      showNotice("Failed to move TODO. See console for details.");
      return false;
    }
  }

  /**
   * Append text to a destination file, creating it if it doesn't exist.
   */
  private async appendToDestination(filePath: string, text: string): Promise<void> {
    let file = this.app.vault.getAbstractFileByPath(filePath);

    if (!file) {
      const pathParts = filePath.split("/");
      pathParts.pop();
      const folderPath = pathParts.join("/");
      if (folderPath) {
        await this.ensureFolderExists(folderPath);
      }
      file = await this.app.vault.create(filePath, "");
    }

    if (!(file instanceof TFile)) {
      throw new Error(`${filePath} is not a file`);
    }

    const currentContent = await this.app.vault.read(file);
    const newContent = currentContent
      ? `${currentContent}\n${text}`
      : text;
    await this.app.vault.modify(file, newContent);
  }

  private async revertSourceFile(todo: TodoItem): Promise<void> {
    await modifyFileLine(
      this.app.vault,
      todo.file,
      todo.lineNumber,
      (line) => {
        let updated = replaceTodoneWithTodo(line);
        if (todo.hasCheckbox) updated = markCheckboxIncomplete(updated);
        return updated;
      },
      (line) => {
        if (!line.includes("#todone")) {
          return `Line ${todo.lineNumber} in ${todo.filePath} no longer contains #todone tag. File may have been modified.`;
        }
        return null;
      },
      todo.fingerprint
    );
  }

  private async updateSourceFile(todo: TodoItem, date: string): Promise<void> {
    const isChildItem = todo.parentLineNumber !== undefined;

    await modifyFileLine(
      this.app.vault,
      todo.file,
      todo.lineNumber,
      (line) => {
        let updated: string;
        if (line.includes("#todo")) {
          updated = replaceTodoWithTodone(line, date);
        } else {
          // Child item without explicit #todo tag
          updated = line.trimEnd() + ` #todone @${date}`;
        }
        if (todo.hasCheckbox) updated = markCheckboxComplete(updated);
        return updated;
      },
      (line) => {
        if (line.includes("#todone")) {
          return `Line ${todo.lineNumber} in ${todo.filePath} already contains #todone tag. File may have been modified.`;
        }
        if (!line.includes("#todo") && !isChildItem) {
          return `Line ${todo.lineNumber} in ${todo.filePath} no longer contains #todo tag. File may have been modified.`;
        }
        return null;
      },
      todo.fingerprint
    );
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
    const isChildItem = todo.parentLineNumber !== undefined;
    try {
      await modifyFileLine(
        this.app.vault,
        todo.file,
        todo.lineNumber,
        (line) => {
          line = line.replace(/#p[0-4]\b/g, "").replace(/#future\b/g, "").replace(/#today\b/g, "");
          line = line.replace(/\s+/g, " ").trim() + ` ${newTag}`;
          if (addFocus && !line.includes("#focus")) line = line + " #focus";
          return line;
        },
        (line) => {
          if (line.includes("#todone")) {
            return `Line ${todo.lineNumber} in ${todo.filePath} contains #todone tag. Item is already completed.`;
          }
          if (!line.includes("#todo") && !isChildItem) {
            return `Line ${todo.lineNumber} in ${todo.filePath} no longer contains #todo tag. File may have been modified.`;
          }
          return null;
        },
        todo.fingerprint
      );

      if (this.scanner) await this.scanner.scanFile(todo.file);
      if (this.onComplete) this.onComplete();
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
      await modifyFileLine(
        this.app.vault,
        todo.file,
        todo.lineNumber,
        (line) => {
          const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const tagPattern = new RegExp(`${escapedTag}\\b\\s*`, "g");
          return line.replace(tagPattern, "").replace(/\s+/g, " ").trim();
        },
        undefined,
        todo.fingerprint
      );

      if (this.scanner) await this.scanner.scanFile(todo.file);
      if (this.onComplete) this.onComplete();
      showNotice(`Removed ${tag}`);
      return true;
    } catch (error) {
      console.error("Error removing tag:", error);
      showNotice("Failed to remove tag. See console for details.");
      return false;
    }
  }

  async addTag(item: TodoItem, tag: string): Promise<boolean> {
    try {
      await modifyFileLine(
        this.app.vault,
        item.file,
        item.lineNumber,
        (line) => line.trimEnd() + ` ${tag}`,
        (line) => {
          // Word-boundary check to avoid matching #todo inside #todone etc.
          const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const tagPattern = new RegExp(`${escapedTag}\\b`);
          return tagPattern.test(line) ? `Tag ${tag} already present` : null;
        },
        item.fingerprint
      );

      if (this.scanner) await this.scanner.scanFile(item.file);
      if (this.onComplete) this.onComplete();
      showNotice(`Added ${tag}`);
      return true;
    } catch (error) {
      // "already present" is not a failure worth surfacing
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("already present")) return true;
      console.error("Error adding tag:", error);
      showNotice("Failed to add tag. See console for details.");
      return false;
    }
  }

  async completeIdea(idea: TodoItem): Promise<boolean> {
    try {
      await modifyFileLine(
        this.app.vault,
        idea.file,
        idea.lineNumber,
        (line) => markCheckboxComplete(removeIdeaTag(line)),
        (line) => !/#idea(?:s|tion)?\b/.test(line)
          ? `Line ${idea.lineNumber} in ${idea.filePath} no longer contains #idea/#ideas/#ideation tag. File may have been modified.`
          : null,
        idea.fingerprint
      );

      if (this.scanner) await this.scanner.scanFile(idea.file);
      if (this.onComplete) this.onComplete();
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
      await modifyFileLine(
        this.app.vault,
        idea.file,
        idea.lineNumber,
        (line) => replaceIdeaWithTodo(line),
        (line) => !/#idea(?:s|tion)?\b/.test(line)
          ? `Line ${idea.lineNumber} in ${idea.filePath} no longer contains #idea/#ideas/#ideation tag. File may have been modified.`
          : null,
        idea.fingerprint
      );

      if (this.scanner) await this.scanner.scanFile(idea.file);
      if (this.onComplete) this.onComplete();
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
      await modifyFileLine(
        this.app.vault,
        idea.file,
        idea.lineNumber,
        (line) => line.includes("#focus") ? line : line.trimEnd() + " #focus",
        undefined,
        idea.fingerprint
      );

      if (this.scanner) await this.scanner.scanFile(idea.file);
      if (this.onComplete) this.onComplete();
      showNotice("Idea focused!");
      return true;
    } catch (error) {
      console.error("Error focusing idea:", error);
      showNotice("Failed to focus idea. See console for details.");
      return false;
    }
  }

  // ========== Batch operations for project tags ==========

  /**
   * Focus all TODOs with the given tag: add #focus and increase priority
   */
  async focusAllWithTag(todos: TodoItem[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const todo of todos) {
      if (todo.tags.includes("#focus")) continue; // Already focused

      const currentPriority = this.getCurrentPriorityTag(todo);
      const newPriority = this.calculateFocusPriority(currentPriority);
      const result = await this.setPriorityTagSilent(todo, newPriority, true);
      if (result) success++;
      else failed++;
    }

    if (success > 0) {
      showNotice(`Focused ${success} TODO${success > 1 ? 's' : ''}`);
    }
    return { success, failed };
  }

  /**
   * Unfocus all TODOs with the given tag: remove #focus
   */
  async unfocusAllWithTag(todos: TodoItem[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const todo of todos) {
      if (!todo.tags.includes("#focus")) continue; // Not focused

      const result = await this.removeTagSilent(todo, "#focus");
      if (result) success++;
      else failed++;
    }

    if (success > 0) {
      showNotice(`Unfocused ${success} TODO${success > 1 ? 's' : ''}`);
    }
    return { success, failed };
  }

  /**
   * Later all TODOs with the given tag: decrease priority
   */
  async laterAllWithTag(todos: TodoItem[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const todo of todos) {
      const currentPriority = this.getCurrentPriorityTag(todo);
      // Skip if already at low priority
      if (currentPriority && /^#p[3-4]$/.test(currentPriority)) continue;

      const newPriority = this.calculateLaterPriority(currentPriority);
      const result = await this.setPriorityTagSilent(todo, newPriority, false);
      if (result) success++;
      else failed++;
    }

    if (success > 0) {
      showNotice(`Set ${success} TODO${success > 1 ? 's' : ''} to later`);
    }
    return { success, failed };
  }

  /**
   * Unlater all TODOs with the given tag: remove low priority tags
   */
  async unlaterAllWithTag(todos: TodoItem[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const todo of todos) {
      const currentPriority = this.getCurrentPriorityTag(todo);
      // Only unlater items with #p3 or #p4
      if (!currentPriority || !/^#p[3-4]$/.test(currentPriority)) continue;

      const result = await this.removeTagSilent(todo, currentPriority);
      if (result) success++;
      else failed++;
    }

    if (success > 0) {
      showNotice(`Unlatered ${success} TODO${success > 1 ? 's' : ''}`);
    }
    return { success, failed };
  }

  /**
   * Snooze all TODOs with the given tag: add #future
   */
  async snoozeAllWithTag(todos: TodoItem[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const todo of todos) {
      if (todo.tags.includes("#future")) continue; // Already snoozed

      const result = await this.setPriorityTagSilent(todo, "#future", false);
      if (result) success++;
      else failed++;
    }

    if (success > 0) {
      showNotice(`Snoozed ${success} TODO${success > 1 ? 's' : ''}`);
    }
    return { success, failed };
  }

  /**
   * Unsnooze all TODOs with the given tag: remove #future
   */
  async unsnoozeAllWithTag(todos: TodoItem[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const todo of todos) {
      if (!todo.tags.includes("#future")) continue; // Not snoozed

      const result = await this.removeTagSilent(todo, "#future");
      if (result) success++;
      else failed++;
    }

    if (success > 0) {
      showNotice(`Unsnoozed ${success} TODO${success > 1 ? 's' : ''}`);
    }
    return { success, failed };
  }

  // ========== Helper methods for batch operations ==========

  private getCurrentPriorityTag(todo: TodoItem): string | null {
    if (todo.tags.includes("#future")) return "#future";
    for (const tag of todo.tags) {
      if (/^#p[0-4]$/.test(tag)) return tag;
    }
    return null;
  }

  private calculateFocusPriority(currentPriority: string | null): string {
    if (!currentPriority || currentPriority === "#future") return "#p0";
    const match = currentPriority.match(/^#p([0-4])$/);
    if (match) {
      const num = parseInt(match[1]);
      return num > 0 ? `#p${num - 1}` : "#p0";
    }
    return "#p0";
  }

  private calculateLaterPriority(currentPriority: string | null): string {
    if (!currentPriority || currentPriority === "#future") return "#p4";
    const match = currentPriority.match(/^#p([0-4])$/);
    if (match) {
      const num = parseInt(match[1]);
      return num < 4 ? `#p${num + 1}` : "#p4";
    }
    return "#p4";
  }

  /**
   * Set priority tag without showing notice (for batch operations).
   * Handles child items that inherit todo status from a parent header.
   */
  private async setPriorityTagSilent(todo: TodoItem, newTag: string, addFocus: boolean): Promise<boolean> {
    const isChildItem = todo.parentLineNumber !== undefined;
    try {
      await modifyFileLine(
        this.app.vault,
        todo.file,
        todo.lineNumber,
        (line) => {
          line = line.replace(/#p[0-4]\b/g, "").replace(/#future\b/g, "").replace(/#today\b/g, "");
          line = line.replace(/\s+/g, " ").trim() + ` ${newTag}`;
          if (addFocus && !line.includes("#focus")) line = line + " #focus";
          return line;
        },
        (line) => {
          if (line.includes("#todone")) return "already completed";
          if (!line.includes("#todo") && !isChildItem) return "not a todo";
          return null;
        },
        todo.fingerprint
      );
      if (this.scanner) await this.scanner.scanFile(todo.file);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove tag without showing notice (for batch operations).
   */
  private async removeTagSilent(todo: TodoItem, tag: string): Promise<boolean> {
    try {
      await modifyFileLine(
        this.app.vault,
        todo.file,
        todo.lineNumber,
        (line) => {
          const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const tagPattern = new RegExp(`${escapedTag}\\b\\s*`, "g");
          return line.replace(tagPattern, "").replace(/\s+/g, " ").trim();
        },
        undefined,
        todo.fingerprint
      );
      if (this.scanner) await this.scanner.scanFile(todo.file);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sort children of a header TODO by status (open first) then completion date (newest first).
   * Respects subheading sections: items are sorted within their section, not across sections.
   * Indented sub-items stay attached to their parent item.
   */
  async sortHeaderChildren(headerTodo: TodoItem): Promise<boolean> {
    if (!headerTodo.isHeader || !headerTodo.childLineNumbers || headerTodo.childLineNumbers.length < 2) {
      return false; // Nothing to sort
    }

    try {
      const content = await this.app.vault.read(headerTodo.file);
      const lines = content.split("\n");

      type ChildLine = { lineNumber: number; text: string; itemType: 'todo' | 'todone' };

      const childLines: ChildLine[] = headerTodo.childLineNumbers
        .filter(lineNum => lineNum >= 0 && lineNum < lines.length)
        .map(lineNum => ({
          lineNumber: lineNum,
          text: lines[lineNum],
          itemType: this.detectItemType(lines[lineNum])
        }));

      // A sort unit is a top-level item plus any indented sub-items beneath it
      type SortUnit = { primary: ChildLine; subItems: ChildLine[] };
      type Section = { subheading: ChildLine | null; units: SortUnit[] };

      const indentOf = (text: string) => {
        const m = text.match(/^(\s*)/);
        return m ? m[1].length : 0;
      };
      const isBoldSubheading = (text: string) =>
        /^\s*(\*\*|__)\S/.test(text) && !/^\s*[-*+]\s/.test(text) && !/^\s*\d+\.\s/.test(text);

      // Split children into sections delimited by bold subheadings
      const sections: Section[] = [];
      let current: Section = { subheading: null, units: [] };
      sections.push(current);

      for (const child of childLines) {
        if (isBoldSubheading(child.text)) {
          current = { subheading: child, units: [] };
          sections.push(current);
        } else {
          const lastUnit = current.units[current.units.length - 1];
          if (lastUnit && indentOf(child.text) > indentOf(lastUnit.primary.text)) {
            lastUnit.subItems.push(child);
          } else {
            current.units.push({ primary: child, subItems: [] });
          }
        }
      }

      // Sort units within each section (subheadings stay anchored)
      for (const section of sections) {
        section.units.sort((a, b) => compareByStatusAndDate(a.primary, b.primary));
      }

      // Flatten back to ordered list
      const sorted: ChildLine[] = [];
      for (const section of sections) {
        if (section.subheading) sorted.push(section.subheading);
        for (const unit of section.units) {
          sorted.push(unit.primary);
          for (const sub of unit.subItems) sorted.push(sub);
        }
      }

      // Check if order changed
      const orderChanged = sorted.some((child, idx) =>
        child.lineNumber !== childLines[idx].lineNumber
      );

      if (!orderChanged) {
        showNotice("Items already sorted");
        return true;
      }

      // Write sorted contents back to the original line positions
      const sortedLineNumbers = [...headerTodo.childLineNumbers].sort((a, b) => a - b);
      const sortedLineContents = sorted.map(c => c.text);
      for (let i = 0; i < sortedLineNumbers.length; i++) {
        lines[sortedLineNumbers[i]] = sortedLineContents[i];
      }

      await this.app.vault.modify(headerTodo.file, lines.join("\n"));

      if (this.scanner) {
        await this.scanner.scanFile(headerTodo.file);
      }

      if (this.onComplete) {
        this.onComplete();
      }

      showNotice("Sorted items");
      return true;
    } catch (error) {
      console.error("Error sorting header children:", error);
      showNotice("Failed to sort items");
      return false;
    }
  }

  /**
   * Detect if a line is complete (todone) or open (todo) based on its content.
   * For list items, checkbox state is the primary indicator.
   */
  private detectItemType(text: string): 'todo' | 'todone' {
    const trimmed = text.trim();

    // For list items, checkbox state is the most reliable indicator
    if (/^-\s*\[x\]/i.test(trimmed)) return 'todone';
    if (/^-\s*\[\s*\]/.test(trimmed)) return 'todo';

    // Strip code spans before checking tags (tags in backticks aren't real tags)
    const textWithoutCode = text.replace(/`[^`]*`/g, "");

    // Check for #todone tag
    if (/#todones?\b/.test(textWithoutCode)) return 'todone';

    // Default to open
    return 'todo';
  }
}
