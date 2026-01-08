import { App, TFile, Notice } from "obsidian";
import { TodoItem } from "./types";
import {
  formatDate,
  replaceTodoWithTodone,
  markCheckboxComplete,
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
}
