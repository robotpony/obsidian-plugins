import { App, TFile, Notice } from "obsidian";
import { TodoItem } from "./types";
import {
  formatDate,
  replaceTodoWithTodone,
  markCheckboxComplete,
  replaceTodoneWithTodo,
  markCheckboxIncomplete,
} from "./utils";

export class TodoProcessor {
  private app: App;
  private dateFormat: string;
  private onComplete?: () => void;

  constructor(app: App, dateFormat: string = "YYYY-MM-DD") {
    this.app = app;
    this.dateFormat = dateFormat;
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

      // Step 1: Update the source file
      await this.updateSourceFile(todo, today);

      // Step 2: Append to TODONE log file
      await this.appendToTodoneFile(todo, todoneFilePath, today);

      // Trigger callback if set
      if (this.onComplete) {
        this.onComplete();
      }

      new Notice("TODO marked as complete!");
      return true;
    } catch (error) {
      console.error("Error completing TODO:", error);
      new Notice("Failed to complete TODO. See console for details.");
      return false;
    }
  }

  async uncompleteTodo(todo: TodoItem): Promise<boolean> {
    try {
      // Update the source file - revert #todone @date to #todo
      await this.revertSourceFile(todo);

      // Note: We do NOT remove from the TODONE log file as it serves as history

      // Trigger callback if set
      if (this.onComplete) {
        this.onComplete();
      }

      new Notice("TODO marked as incomplete!");
      return true;
    } catch (error) {
      console.error("Error uncompleting TODO:", error);
      new Notice("Failed to uncomplete TODO. See console for details.");
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

    // Replace #todo with #todone @date
    updatedLine = replaceTodoWithTodone(updatedLine, date);

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

      // Trigger callback if set
      if (this.onComplete) {
        this.onComplete();
      }

      new Notice(`Priority set to ${newTag}${addFocus ? " + #focus" : ""}`);
      return true;
    } catch (error) {
      console.error("Error setting priority:", error);
      new Notice("Failed to set priority. See console for details.");
      return false;
    }
  }
}
