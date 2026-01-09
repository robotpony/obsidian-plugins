import { App, Menu } from "obsidian";
import { TodoItem } from "./types";
import { TodoProcessor } from "./TodoProcessor";

export class ContextMenuHandler {
  private app: App;
  private processor: TodoProcessor;
  private priorityTags: string[];

  constructor(
    app: App,
    processor: TodoProcessor,
    priorityTags: string[]
  ) {
    this.app = app;
    this.processor = processor;
    this.priorityTags = priorityTags;
  }

  /**
   * Show context menu for an active TODO item
   */
  showTodoMenu(evt: MouseEvent, todo: TodoItem, onRefresh: () => void): void {
    const menu = new Menu();

    const currentPriority = this.getCurrentPriority(todo);

    // Focus - Increase priority (decrease number or set to #p0) + add #focus tag
    menu.addItem((item) => {
      item
        .setTitle("Focus")
        .setIcon("zap")
        .onClick(async () => {
          const newPriority = this.calculateFocusPriority(currentPriority);
          const success = await this.processor.setPriorityTag(todo, newPriority, true); // addFocus=true
          if (success) onRefresh();
        });
    });

    // Later - Decrease priority (increase number or set to #p4)
    menu.addItem((item) => {
      item
        .setTitle("Later")
        .setIcon("clock")
        .onClick(async () => {
          const newPriority = this.calculateLaterPriority(currentPriority);
          const success = await this.processor.setPriorityTag(todo, newPriority);
          if (success) onRefresh();
        });
    });

    // Snooze - Set to #future
    menu.addItem((item) => {
      item
        .setTitle("Snooze")
        .setIcon("moon")
        .onClick(async () => {
          const success = await this.processor.setPriorityTag(todo, "#future");
          if (success) onRefresh();
        });
    });

    menu.showAtMouseEvent(evt);
  }

  /**
   * Extract current priority tag from TODO
   */
  private getCurrentPriority(todo: TodoItem): string | null {
    // Check for #future
    if (todo.tags.includes("#future")) {
      return "#future";
    }

    // Check for #p0-#p4
    for (const tag of todo.tags) {
      if (/^#p[0-4]$/.test(tag)) {
        return tag;
      }
    }

    return null;
  }

  /**
   * Calculate new priority for Focus action
   * If no priority or #future → #p0
   * If #pN → #p(N-1), but #p0 stays #p0
   */
  private calculateFocusPriority(currentPriority: string | null): string {
    if (!currentPriority || currentPriority === "#future") {
      return "#p0";
    }

    // Extract number from #pN
    const match = currentPriority.match(/^#p([0-4])$/);
    if (match) {
      const num = parseInt(match[1]);
      return num > 0 ? `#p${num - 1}` : "#p0";
    }

    return "#p0";
  }

  /**
   * Calculate new priority for Later action
   * If no priority or #future → #p4
   * If #pN → #p(N+1), but #p4 stays #p4
   */
  private calculateLaterPriority(currentPriority: string | null): string {
    if (!currentPriority || currentPriority === "#future") {
      return "#p4";
    }

    // Extract number from #pN
    const match = currentPriority.match(/^#p([0-4])$/);
    if (match) {
      const num = parseInt(match[1]);
      return num < 4 ? `#p${num + 1}` : "#p4";
    }

    return "#p4";
  }
}
