import { App, TFile } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { ProjectInfo, TodoItem } from "./types";
import { getPriorityValue } from "./utils";

export class ProjectManager {
  private app: App;
  private scanner: TodoScanner;
  private projectsFolder: string;
  private priorityTags: string[];

  constructor(
    app: App,
    scanner: TodoScanner,
    projectsFolder: string,
    priorityTags: string[]
  ) {
    this.app = app;
    this.scanner = scanner;
    this.projectsFolder = projectsFolder;
    this.priorityTags = priorityTags;
  }

  getProjects(): ProjectInfo[] {
    const todos = this.scanner.getTodos();
    const projectMap = new Map<string, ProjectInfo>();

    // Aggregate project data from all todos
    for (const todo of todos) {
      // Extract all tags except #todo(s), #todone(s), #idea(s), #principle(s), #future, #focus, and priority tags
      const excludedTags = new Set([
        "#todo", "#todos", "#todone", "#todones",
        "#idea", "#ideas", "#principle", "#principles",
        "#future", "#focus",
        ...this.priorityTags
      ]);
      const projectTags = todo.tags.filter(tag => !excludedTags.has(tag));

      const todoPriority = getPriorityValue(todo.tags);

      for (const tag of projectTags) {
        if (projectMap.has(tag)) {
          const project = projectMap.get(tag)!;
          project.count++;
          // Update last activity to most recent
          project.lastActivity = Math.max(
            project.lastActivity,
            todo.dateCreated
          );
          // Track highest priority (lowest number)
          project.highestPriority = Math.min(
            project.highestPriority,
            todoPriority
          );
        } else {
          projectMap.set(tag, {
            tag,
            count: 1,
            lastActivity: todo.dateCreated,
            highestPriority: todoPriority,
          });
        }
      }
    }

    // Convert to array and return
    return Array.from(projectMap.values());
  }

  getFocusProjects(limit?: number): ProjectInfo[] {
    const projects = this.getProjects();

    // Sort by activity (count + recency)
    projects.sort((a, b) => {
      // Higher count = more active
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;

      // If counts equal, more recent = more active
      return b.lastActivity - a.lastActivity;
    });

    // Apply limit if specified
    if (limit !== undefined && limit > 0) {
      return projects.slice(0, limit);
    }

    return projects;
  }

  async openProjectFile(tag: string): Promise<void> {
    // Remove # from tag to get filename
    const filename = tag.replace(/^#/, "") + ".md";
    const filepath = this.projectsFolder + filename;

    // Check if file exists
    const file = this.app.vault.getAbstractFileByPath(filepath);

    if (file instanceof TFile) {
      // File exists, open it
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    } else {
      // File doesn't exist, create it
      await this.createProjectFile(filepath, tag);
    }
  }

  private async createProjectFile(filepath: string, tag: string): Promise<void> {
    // Ensure the projects folder exists
    const folderPath = filepath.substring(0, filepath.lastIndexOf("/"));
    if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
      await this.app.vault.createFolder(folderPath);
    }

    // Create the file with a basic template
    const projectName = tag.replace(/^#/, "");
    const content = `# ${projectName}\n\n${tag}\n\n## Overview\n\n## TODOs\n\n`;

    const file = await this.app.vault.create(filepath, content);

    // Open the newly created file
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
}
