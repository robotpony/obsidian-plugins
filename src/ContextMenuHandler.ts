import { App, Menu, TFile } from "obsidian";
import { TodoItem, ProjectInfo } from "./types";
import { TodoProcessor } from "./TodoProcessor";
import { TodoScanner } from "./TodoScanner";
import { MoveTargetModal } from "./MoveTargetModal";
import { tallyProjectTags } from "./utils";

export class ContextMenuHandler {
  private app: App;
  private processor: TodoProcessor;
  private priorityTags: string[];
  private getMoveHistory: () => string[];
  // Optional: undefined for the Projects sidebar's own ContextMenuHandler,
  // where "show in Projects" would just point back at the view you're
  // already looking at. Only the TODOs sidebar wires this.
  private onOpenProject?: (tag: string) => void;

  constructor(
    app: App,
    processor: TodoProcessor,
    priorityTags: string[],
    getMoveHistory: () => string[],
    onOpenProject?: (tag: string) => void
  ) {
    this.app = app;
    this.processor = processor;
    this.priorityTags = priorityTags;
    this.getMoveHistory = getMoveHistory;
    this.onOpenProject = onOpenProject;
  }

  /**
   * The item's own project tag, if it has exactly the kind of tag the tag
   * cloud would show as a project pill. Reuses `tallyProjectTags`'s
   * exclusion list so "project tag" means the same thing here as it does
   * everywhere else in the sidebar.
   */
  private projectTagFor(item: TodoItem): string | null {
    const tags = tallyProjectTags([item], this.priorityTags);
    return tags.size > 0 ? tags.keys().next().value! : null;
  }

  /**
   * Show context menu for an active TODO item
   */
  /**
   * `includeMove` defaults to true for the existing TODOs sidebar. The Projects
   * sidebar passes false: moving a project-note item elsewhere conflicts with it
   * reappearing in its original note on the next sync (see DESIGN.md's Projects
   * Extension detail-view notes; the plugin-wide move feature is separately
   * tracked for removal in PLAN.md, unrelated to Projects).
   */
  showTodoMenu(evt: MouseEvent, todo: TodoItem, onRefresh: () => void, includeMove: boolean = true): void {
    const menu = new Menu();

    const currentPriority = this.getCurrentPriority(todo);
    const hasFocus = todo.tags.includes("#focus");
    const hasFuture = todo.tags.includes("#future");
    const hasLaterPriority = currentPriority && /^#p[3-4]$/.test(currentPriority);

    // Copy - copies the full line text to clipboard
    menu.addItem((item) => {
      item
        .setTitle("Copy")
        .setIcon("copy")
        .onClick(async () => {
          await navigator.clipboard.writeText(todo.text);
        });
    });

    // Move to... - move TODO to another file
    if (includeMove) {
      menu.addItem((item) => {
        item
          .setTitle("Move to...")
          .setIcon("arrow-right")
          .onClick(() => {
            new MoveTargetModal(
              this.app,
              this.getMoveHistory(),
              todo.filePath,
              async (file: TFile) => {
                const success = await this.processor.moveTodo(todo, file.path);
                if (success) onRefresh();
              }
            ).open();
          });
      });
    }

    // Focus - Toggle: if has #focus, remove it; otherwise add #focus + increase priority
    menu.addItem((item) => {
      item
        .setTitle(hasFocus ? "Unfocus" : "Focus")
        .setIcon("zap")
        .onClick(async () => {
          let success: boolean;
          if (hasFocus) {
            // Remove #focus tag
            success = await this.processor.removeTag(todo, "#focus");
          } else {
            // Add #focus and increase priority
            const newPriority = this.calculateFocusPriority(currentPriority);
            success = await this.processor.setPriorityTag(todo, newPriority, true);
          }
          if (success) onRefresh();
        });
    });

    // Later - Toggle: if has low priority (#p3/#p4), remove priority; otherwise decrease priority
    menu.addItem((item) => {
      item
        .setTitle(hasLaterPriority ? "Unlater" : "Later")
        .setIcon("clock")
        .onClick(async () => {
          let success: boolean;
          if (hasLaterPriority) {
            // Remove priority tag
            success = await this.processor.removeTag(todo, currentPriority!);
          } else {
            // Decrease priority
            const newPriority = this.calculateLaterPriority(currentPriority);
            success = await this.processor.setPriorityTag(todo, newPriority);
          }
          if (success) onRefresh();
        });
    });

    // Snooze - Toggle: if has #future, remove it; otherwise set to #future
    menu.addItem((item) => {
      item
        .setTitle(hasFuture ? "Unsnooze" : "Snooze")
        .setIcon("moon")
        .onClick(async () => {
          let success: boolean;
          if (hasFuture) {
            // Remove #future tag
            success = await this.processor.removeTag(todo, "#future");
          } else {
            // Set to #future
            success = await this.processor.setPriorityTag(todo, "#future");
          }
          if (success) onRefresh();
        });
    });

    // Show in Projects - jumps the Projects sidebar to this item's project,
    // when it has one. Only offered where onOpenProject is wired (the TODOs
    // sidebar), and only when the item actually carries a project tag.
    const projectTag = this.onOpenProject ? this.projectTagFor(todo) : null;
    if (projectTag) {
      menu.addSeparator();
      menu.addItem((item) => {
        item
          .setTitle("Show in Projects")
          .setIcon("folder-git-2")
          .onClick(() => this.onOpenProject!(projectTag));
      });
    }

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

  /**
   * Show context menu for a project (focus list item)
   * Operations apply to all TODOs matching the project tag
   */
  showProjectMenu(
    evt: MouseEvent,
    project: ProjectInfo,
    scanner: TodoScanner,
    onRefresh: () => void,
    onFilterByTag: (tag: string) => void
  ): void {
    const menu = new Menu();

    // Get all TODOs with this project tag
    const getTodosForProject = (): TodoItem[] => {
      return scanner.getTodos().filter(todo => todo.tags.includes(project.tag));
    };

    const todos = getTodosForProject();

    // Determine current state of project items
    const anyHasFocus = todos.some(t => t.tags.includes("#focus"));
    const anyHasFuture = todos.some(t => t.tags.includes("#future"));
    const anyHasLaterPriority = todos.some(t => {
      for (const tag of t.tags) {
        if (/^#p[3-4]$/.test(tag)) return true;
      }
      return false;
    });

    // Tag submenu with Filter by option
    menu.addItem((item) => {
      item
        .setTitle(project.tag)
        .setIcon("tag");

      const submenu = (item as any).setSubmenu();
      submenu.addItem((subItem: any) => {
        subItem
          .setTitle("Filter by")
          .setIcon("filter")
          .onClick(() => {
            onFilterByTag(project.tag);
          });
      });
      if (this.onOpenProject) {
        submenu.addItem((subItem: any) => {
          subItem
            .setTitle("Show in Projects")
            .setIcon("folder-git-2")
            .onClick(() => this.onOpenProject!(project.tag));
        });
      }
    });

    menu.addSeparator();

    // Focus/Unfocus - applies to all matching TODOs
    menu.addItem((item) => {
      item
        .setTitle(anyHasFocus ? "Unfocus" : "Focus")
        .setIcon("zap")
        .onClick(async () => {
          const currentTodos = getTodosForProject();
          if (anyHasFocus) {
            await this.processor.unfocusAllWithTag(currentTodos);
          } else {
            await this.processor.focusAllWithTag(currentTodos);
          }
          onRefresh();
        });
    });

    // Later/Unlater - applies to all matching TODOs
    menu.addItem((item) => {
      item
        .setTitle(anyHasLaterPriority ? "Unlater" : "Later")
        .setIcon("clock")
        .onClick(async () => {
          const currentTodos = getTodosForProject();
          if (anyHasLaterPriority) {
            await this.processor.unlaterAllWithTag(currentTodos);
          } else {
            await this.processor.laterAllWithTag(currentTodos);
          }
          onRefresh();
        });
    });

    // Snooze/Unsnooze - applies to all matching TODOs
    menu.addItem((item) => {
      item
        .setTitle(anyHasFuture ? "Unsnooze" : "Snooze")
        .setIcon("moon")
        .onClick(async () => {
          const currentTodos = getTodosForProject();
          if (anyHasFuture) {
            await this.processor.unsnoozeAllWithTag(currentTodos);
          } else {
            await this.processor.snoozeAllWithTag(currentTodos);
          }
          onRefresh();
        });
    });

    menu.showAtMouseEvent(evt);
  }

  /**
   * Show context menu for an idea item
   */
  showIdeaMenu(evt: MouseEvent, idea: TodoItem, onRefresh: () => void): void {
    const menu = new Menu();

    const hasFocus = idea.tags.includes("#focus");

    // Add to TODOs - converts #idea to #todo
    menu.addItem((item) => {
      item
        .setTitle("Add to TODOs")
        .setIcon("check-square")
        .onClick(async () => {
          const success = await this.processor.convertIdeaToTodo(idea);
          if (success) onRefresh();
        });
    });

    // Copy - copies the full line text to clipboard
    menu.addItem((item) => {
      item
        .setTitle("Copy")
        .setIcon("copy")
        .onClick(async () => {
          await navigator.clipboard.writeText(idea.text);
        });
    });

    // Focus - Toggle: if has #focus, remove it; otherwise add #focus
    menu.addItem((item) => {
      item
        .setTitle(hasFocus ? "Unfocus" : "Focus")
        .setIcon("zap")
        .onClick(async () => {
          let success: boolean;
          if (hasFocus) {
            // Remove #focus tag
            success = await this.processor.removeTag(idea, "#focus");
          } else {
            // Add #focus tag
            success = await this.processor.addFocusToIdea(idea);
          }
          if (success) onRefresh();
        });
    });

    // Show in Projects - see showTodoMenu's identical block above.
    const projectTag = this.onOpenProject ? this.projectTagFor(idea) : null;
    if (projectTag) {
      menu.addSeparator();
      menu.addItem((item) => {
        item
          .setTitle("Show in Projects")
          .setIcon("folder-git-2")
          .onClick(() => this.onOpenProject!(projectTag));
      });
    }

    menu.showAtMouseEvent(evt);
  }

}
