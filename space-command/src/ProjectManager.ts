import { App, TFile } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { ProjectInfo, TodoItem } from "./types";
import { getPriorityValue } from "./utils";

export class ProjectManager {
  private app: App;
  private scanner: TodoScanner;
  private projectsFolder: string;
  private priorityTags: string[];
  private excludeFolders: string[];

  constructor(
    app: App,
    scanner: TodoScanner,
    projectsFolder: string,
    priorityTags: string[],
    excludeFolders: string[] = []
  ) {
    this.app = app;
    this.scanner = scanner;
    this.projectsFolder = projectsFolder;
    this.priorityTags = priorityTags;
    this.excludeFolders = excludeFolders;
  }

  getProjects(): ProjectInfo[] {
    const todos = this.scanner.getTodos();
    const projectMap = new Map<string, ProjectInfo>();

    // Aggregate project data from all todos
    for (const todo of todos) {
      // Extract all tags except #todo(s), #todone(s), #idea(s)/#ideation, #principle(s), #future, #focus, and priority tags
      const excludedTags = new Set([
        "#todo", "#todos", "#todone", "#todones",
        "#idea", "#ideas", "#ideation", "#principle", "#principles",
        "#future", "#focus",
        ...this.priorityTags
      ]);
      const explicitProjectTags = todo.tags.filter(tag => !excludedTags.has(tag));

      // Use explicit project tags if present, otherwise fall back to inferred file tag
      // This implements "manual tags win" - items with explicit project tags won't get file-level grouping
      // Only use inferred tags for files in the projects folder and not in excluded folders
      let projectTags = explicitProjectTags;
      if (projectTags.length === 0 && todo.inferredFileTag) {
        const isInProjectsFolder = todo.folder.startsWith(this.projectsFolder.replace(/\/$/, ""));
        const isInExcludedFolder = this.excludeFolders.some(folder =>
          todo.folder === folder || todo.folder.startsWith(folder + "/")
        );
        if (isInProjectsFolder && !isInExcludedFolder) {
          projectTags = [todo.inferredFileTag];
        }
      }

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

    // Sort by: 1) has focus items, 2) priority, 3) count (as proxy for tag activity)
    projects.sort((a, b) => {
      // Focus items first (priority 0 = #focus)
      const aHasFocus = a.highestPriority === 0;
      const bHasFocus = b.highestPriority === 0;
      if (aHasFocus && !bHasFocus) return -1;
      if (!aHasFocus && bHasFocus) return 1;

      // Then by priority
      const priorityDiff = a.highestPriority - b.highestPriority;
      if (priorityDiff !== 0) return priorityDiff;

      // Then by count (higher count = more items/activity)
      return b.count - a.count;
    });

    // Apply limit if specified
    if (limit !== undefined && limit > 0) {
      return projects.slice(0, limit);
    }

    return projects;
  }

  getProjectFilePath(tag: string): string {
    const filename = tag.replace(/^#/, "") + ".md";
    return this.projectsFolder + filename;
  }

  async getProjectFileInfo(tag: string): Promise<{ description: string; principles: string[]; filepath: string } | null> {
    const filepath = this.getProjectFilePath(tag);
    const file = this.app.vault.getAbstractFileByPath(filepath);

    if (!(file instanceof TFile)) {
      return null;
    }

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    // Skip frontmatter if present
    let startIndex = 0;
    if (lines[0]?.trim() === "---") {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i]?.trim() === "---") {
          startIndex = i + 1;
          break;
        }
      }
    }

    // Extract first 1-2 content blocks (paragraphs or callouts)
    // Skip headings, embeds, code blocks, and the project tag line
    const blocks: string[] = [];
    let currentBlock = "";
    let inCodeBlock = false;
    let inCallout = false;

    for (let i = startIndex; i < lines.length && blocks.length < 2; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Track code block state
      if (trimmed.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        // End current block when entering/exiting code block
        if (currentBlock) {
          blocks.push(currentBlock.trim());
          currentBlock = "";
          inCallout = false;
        }
        continue;
      }

      // Skip content inside code blocks
      if (inCodeBlock) {
        continue;
      }

      // Skip headings
      if (trimmed.startsWith("#") && trimmed.match(/^#+\s/)) {
        if (currentBlock) {
          blocks.push(currentBlock.trim());
          currentBlock = "";
          inCallout = false;
        }
        continue;
      }

      // Skip lines that are just the project tag
      if (trimmed === tag) {
        continue;
      }

      // Skip inline embed syntax {{...}}
      if (trimmed.match(/^\{\{.*\}\}$/)) {
        continue;
      }

      // Check if this is the start of a callout
      if (trimmed.match(/^>\s*\[!/)) {
        // End any previous block
        if (currentBlock) {
          blocks.push(currentBlock.trim());
          currentBlock = "";
        }
        inCallout = true;
        currentBlock = line;
        continue;
      }

      // Check if this is a continuation of a callout (line starting with >)
      if (inCallout && trimmed.startsWith(">")) {
        currentBlock += "\n" + line;
        continue;
      }

      // If we were in a callout but this line doesn't continue it, end the callout
      if (inCallout && !trimmed.startsWith(">")) {
        if (currentBlock) {
          blocks.push(currentBlock.trim());
          currentBlock = "";
        }
        inCallout = false;
        // Fall through to process this line as regular content
      }

      // Empty line marks end of paragraph
      if (trimmed === "") {
        if (currentBlock) {
          blocks.push(currentBlock.trim());
          currentBlock = "";
        }
        continue;
      }

      // Accumulate paragraph text (strip any inline embeds from the line)
      const cleanedLine = trimmed.replace(/\{\{[^}]*\}\}/g, "").trim();
      if (cleanedLine) {
        currentBlock += (currentBlock ? " " : "") + cleanedLine;
      }
    }

    // Don't forget the last block if we didn't hit an empty line
    if (currentBlock && blocks.length < 2) {
      blocks.push(currentBlock.trim());
    }

    // Extract all #principle or #principles tags from the entire content
    const principleRegex = /#principles?\b/gi;
    const principlesInFile: string[] = [];

    // Find all lines containing #principle(s) and extract the full context
    for (const line of lines) {
      if (line.match(principleRegex)) {
        // Extract all tags from this line
        const tagMatches = line.match(/#[\w-]+/g);
        if (tagMatches) {
          for (const match of tagMatches) {
            // Skip the #principle(s) tag itself, collect other tags on the same line
            if (!match.match(/^#principles?$/i) && !principlesInFile.includes(match)) {
              principlesInFile.push(match);
            }
          }
        }
      }
    }

    return {
      description: blocks.join("\n\n"),
      principles: principlesInFile,
      filepath,
    };
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
