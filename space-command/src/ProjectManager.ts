import { App, TFile } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { ProjectInfo } from "./types";

export class ProjectManager {
  private app: App;
  private scanner: TodoScanner;
  private pinnedProjects: Set<string>;
  private projectsFolder: string;

  constructor(
    app: App,
    scanner: TodoScanner,
    projectsFolder: string,
    pinnedProjects: string[]
  ) {
    this.app = app;
    this.scanner = scanner;
    this.projectsFolder = projectsFolder;
    this.pinnedProjects = new Set(pinnedProjects);
  }

  setPinnedProjects(projects: string[]): void {
    this.pinnedProjects = new Set(projects);
  }

  getPinnedProjects(): string[] {
    return Array.from(this.pinnedProjects);
  }

  togglePin(tag: string): boolean {
    if (this.pinnedProjects.has(tag)) {
      this.pinnedProjects.delete(tag);
      return false;
    } else {
      this.pinnedProjects.add(tag);
      return true;
    }
  }

  isPinned(tag: string): boolean {
    return this.pinnedProjects.has(tag);
  }

  getProjects(): ProjectInfo[] {
    const todos = this.scanner.getTodos();
    const projectMap = new Map<string, ProjectInfo>();

    // Aggregate project data from all todos
    for (const todo of todos) {
      // Extract all tags except #todo and #todone
      const projectTags = todo.tags.filter(
        (tag) => tag !== "#todo" && tag !== "#todone"
      );

      for (const tag of projectTags) {
        if (projectMap.has(tag)) {
          const project = projectMap.get(tag)!;
          project.count++;
          // Update last activity to most recent
          project.lastActivity = Math.max(
            project.lastActivity,
            todo.dateCreated
          );
        } else {
          projectMap.set(tag, {
            tag,
            count: 1,
            lastActivity: todo.dateCreated,
            isPinned: this.pinnedProjects.has(tag),
          });
        }
      }
    }

    // Convert to array and return
    return Array.from(projectMap.values());
  }

  getFocusProjects(limit?: number): ProjectInfo[] {
    const projects = this.getProjects();

    // Sort: pinned first, then by activity (count + recency)
    projects.sort((a, b) => {
      // Pinned projects come first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      // For non-pinned (or both pinned), sort by activity
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
