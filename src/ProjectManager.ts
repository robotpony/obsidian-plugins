import { App, Modal, TFile } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { ProjectInfo, TodoItem } from "./types";
import { getPriorityValue, hasTag } from "./utils";
import { ScannedProject } from "./ProjectScanner";
import { ParsedProjectItem } from "./StructuredFileParser";

/**
 * Shared by ProjectManager (interactive, tag-click flow) and ProjectSyncManager
 * (automatic, repo-sync flow) — both resolve a project tag to the same vault note
 * path, so the join logic lives in one place rather than being duplicated.
 */
export function projectFilePath(projectsFolder: string, tag: string): string {
  const filename = tag.replace(/^#/, "") + ".md";
  return projectsFolder + filename;
}

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

  /**
   * Resolves which project tag(s) a single TODO belongs to, in the same
   * precedence `getProjects()` aggregates by: explicit project tags always
   * win; only with none present does a file under the configured projects
   * folder (and not excluded via `excludeFoldersFromProjects`) fall back to
   * its inferred file tag. Extracted from `getProjects()`'s aggregation loop
   * so render-path code (e.g. SidebarView styling a vault TODO block to
   * match a project's identity) can resolve one item without duplicating —
   * and risking drift from — this same precedence.
   */
  resolveProjectTags(todo: TodoItem): string[] {
    // Extract all tags except #todo(s), #todone(s), #idea(s)/#ideation, #principle(s), snooze tags, #focus, #today, and priority tags
    const excludedTags = new Set([
      "#todo", "#todos", "#todone", "#todones",
      "#idea", "#ideas", "#ideation", "#principle", "#principles",
      "#future", "#snooze", "#snoozed", "#focus", "#today",
      ...this.priorityTags
    ]);
    const explicitProjectTags = todo.tags.filter(tag => !excludedTags.has(tag));
    if (explicitProjectTags.length > 0) return explicitProjectTags;

    // No explicit tag — fall back to the inferred file tag, but only for
    // files in the projects folder and not in an excluded folder.
    if (todo.inferredFileTag && this.isInProjectsFolder(todo.folder)) {
      return [todo.inferredFileTag];
    }
    return [];
  }

  /**
   * True when `folder` (a TodoItem's own folder, no filename) sits under the
   * configured projects folder and isn't inside an `excludeFoldersFromProjects`
   * subfolder. Exposed separately from `resolveProjectTags()` for a caller
   * that wants "is this file itself a project note" independent of whatever
   * explicit tags a specific TODO in it happens to carry — see SidebarView's
   * resolveProjectBlockMatch, which styles a block by file location alone
   * rather than resolveProjectTags()'s explicit-tag-first precedence (a
   * generic context tag like #work isn't a project, but explicit-tag
   * precedence would otherwise make it look like one).
   */
  isInProjectsFolder(folder: string): boolean {
    const isUnderProjectsFolder = folder.startsWith(this.projectsFolder.replace(/\/$/, ""));
    const isExcluded = this.excludeFolders.some(excluded =>
      folder === excluded || folder.startsWith(excluded + "/")
    );
    return isUnderProjectsFolder && !isExcluded;
  }

  /**
   * `scannedProjects` merges in repo-derived facts (branch, status, remote,
   * local path) for any tag that matches a detected git repo's folder name —
   * a repo with zero tracked items still gets an entry, and a tag-only project
   * (no matching repo) is unaffected. Synchronous: callers are expected to pass
   * the most recent `ProjectScanner`/`ProjectSyncManager.syncAll()` result
   * rather than triggering a fresh scan here (scanning shells out to `git` per
   * repo — not something render-path code should trigger on its own).
   *
   * `getCachedItems`, when supplied, folds each repo-matched project's
   * synced items (from `ProjectSyncManager.getCachedItems()`) into
   * `count`/`highestPriority`/`hasFocusItems` alongside the vault-derived
   * numbers — see `foldSyncedItemsIntoProjects` below. Callers that only
   * care about vault items can omit it; the merge step is skipped entirely.
   */
  getProjects(
    scannedProjects: ScannedProject[] = [],
    getCachedItems?: (localPath: string) => ParsedProjectItem[]
  ): ProjectInfo[] {
    const todos = this.scanner.getTodos();
    // Track projects with priority sum for weighted average calculation
    const projectMap = new Map<string, ProjectInfo & { prioritySum: number }>();

    // Aggregate project data from all todos
    for (const todo of todos) {
      const projectTags = this.resolveProjectTags(todo);

      const todoPriority = getPriorityValue(todo.tags);
      const todoHasFocus = hasTag(todo.tags, "#focus");

      for (const tag of projectTags) {
        if (projectMap.has(tag)) {
          const project = projectMap.get(tag)!;
          project.count++;
          project.prioritySum += todoPriority;
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
          // Track if any item has #focus
          if (todoHasFocus) {
            project.hasFocusItems = true;
          }
        } else {
          projectMap.set(tag, {
            tag,
            count: 1,
            lastActivity: todo.dateCreated,
            highestPriority: todoPriority,
            hasFocusItems: todoHasFocus,
            prioritySum: todoPriority,
            colourIndex: 4, // default, will be calculated below
          });
        }
      }
    }

    // Calculate colourIndex from weighted average priority for each project
    // Priority values range from 1 (#today) to 8 (#future)
    // Map to colourIndex 0-6 for CSS styling
    const projects: ProjectInfo[] = [];
    for (const [, project] of projectMap) {
      const avgPriority = project.prioritySum / project.count;
      // Map avgPriority (1-8) to colourIndex (0-6)
      const colourIndex = Math.min(6, Math.round((avgPriority - 1) * 6 / 7));
      projects.push({
        tag: project.tag,
        count: project.count,
        lastActivity: project.lastActivity,
        highestPriority: project.highestPriority,
        hasFocusItems: project.hasFocusItems,
        colourIndex,
      });
    }

    const merged = mergeScannedProjects(projects, scannedProjects);
    return getCachedItems ? foldSyncedItemsIntoProjects(merged, getCachedItems) : merged;
  }

  getFocusProjects(limit?: number): ProjectInfo[] {
    const projects = this.getProjects();

    // Sort by: 1) focus tier (projects with focus items first), 2) priority, 3) count
    projects.sort((a, b) => {
      // Focus tier: projects with focused items sort above those without
      if (a.hasFocusItems && !b.hasFocusItems) return -1;
      if (!a.hasFocusItems && b.hasFocusItems) return 1;

      // Priority (lower = higher priority)
      const priorityDiff = a.highestPriority - b.highestPriority;
      if (priorityDiff !== 0) return priorityDiff;

      // Count (higher count = more items/activity)
      return b.count - a.count;
    });

    // Apply limit if specified
    if (limit !== undefined && limit > 0) {
      return projects.slice(0, limit);
    }

    return projects;
  }

  getProjectFilePath(tag: string): string {
    return projectFilePath(this.projectsFolder, tag);
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

    // Post-process: trim any trailing heading from the last block
    // (headings without following content don't make sense in a summary)
    if (blocks.length > 0) {
      const lastBlock = blocks[blocks.length - 1];
      const blockLines = lastBlock.split("\n");
      // Check if last line is a heading
      while (blockLines.length > 0) {
        const lastLine = blockLines[blockLines.length - 1].trim();
        if (lastLine.match(/^#+\s/)) {
          blockLines.pop();
        } else {
          break;
        }
      }
      if (blockLines.length === 0) {
        // The entire block was headings, remove it
        blocks.pop();
      } else {
        blocks[blocks.length - 1] = blockLines.join("\n").trim();
      }
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
      // File doesn't exist, ask before creating
      const confirmed = await this.confirmCreateProjectFile(tag, filepath);
      if (confirmed) {
        await this.createProjectFile(filepath, tag);
      }
    }
  }

  private confirmCreateProjectFile(tag: string, filepath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText("Create Project File?");
      modal.contentEl.createEl("p", {
        text: `Create project file for ${tag} in ${this.projectsFolder}?`,
      });

      const buttonContainer = modal.contentEl.createEl("div", {
        cls: "modal-button-container",
      });
      buttonContainer.style.display = "flex";
      buttonContainer.style.justifyContent = "flex-end";
      buttonContainer.style.gap = "8px";
      buttonContainer.style.marginTop = "16px";

      const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
      cancelBtn.addEventListener("click", () => {
        modal.close();
        resolve(false);
      });

      const createBtn = buttonContainer.createEl("button", {
        text: "Create",
        cls: "mod-cta",
      });
      createBtn.addEventListener("click", () => {
        modal.close();
        resolve(true);
      });

      modal.open();
    });
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

/**
 * Merges repo-derived facts into tag-derived ProjectInfo by name (tag minus
 * `#` === repo folder name). A scanned repo with no matching tag-derived entry
 * (no tracked items yet, or none hand-tagged) still gets its own entry — the
 * Projects sidebar should show every detected repo, not just ones with existing
 * vault activity.
 */
function mergeScannedProjects(projects: ProjectInfo[], scannedProjects: ScannedProject[]): ProjectInfo[] {
  if (scannedProjects.length === 0) return projects;

  const scannedByName = new Map(scannedProjects.map((p) => [p.name, p]));
  const merged = new Map<string, ProjectInfo>();

  for (const project of projects) {
    const name = project.tag.replace(/^#/, "");
    const scanned = scannedByName.get(name);
    merged.set(name, scanned ? { ...project, ...repoFields(scanned) } : project);
  }

  for (const [name, scanned] of scannedByName) {
    if (merged.has(name)) continue;
    merged.set(name, {
      tag: `#${name}`,
      count: 0,
      lastActivity: 0,
      highestPriority: 8, // unmarked-item value, matches getPriorityValue's default
      hasFocusItems: false,
      colourIndex: 4,
      ...repoFields(scanned),
    });
  }

  return [...merged.values()];
}

/**
 * Folds each repo-matched project's non-completed synced items (from
 * `ProjectSyncManager.getCachedItems()`) into `count`/`highestPriority`/
 * `hasFocusItems`, the same three fields the vault-todo loop in
 * `getProjects()` computes. Keeps the TODOs tab's tag cloud and interleaved
 * project blocks (`SidebarView.renderActiveTodos`) sorting/filtering
 * consistently whether an item lives in the vault or a repo file — a
 * project with a `#focus` synced item should sort to the top of the pill
 * cloud exactly like one with a `#focus` vault item does.
 *
 * `colourIndex` is deliberately left untouched — it's derived from a
 * weighted average of vault priorities computed earlier in `getProjects()`,
 * and re-deriving it from a second, differently-shaped item set isn't worth
 * the complexity for a cosmetic pill colour.
 */
function foldSyncedItemsIntoProjects(
  projects: ProjectInfo[],
  getCachedItems: (localPath: string) => ParsedProjectItem[]
): ProjectInfo[] {
  return projects.map((project) => {
    if (!project.localPath) return project;
    const items = getCachedItems(project.localPath).filter((i) => !i.completed);
    if (items.length === 0) return project;

    let count = project.count;
    let highestPriority = project.highestPriority;
    let hasFocusItems = project.hasFocusItems;
    for (const item of items) {
      count++;
      highestPriority = Math.min(highestPriority, getPriorityValue(item.tags));
      if (hasTag(item.tags, "#focus")) hasFocusItems = true;
    }

    return { ...project, count, highestPriority, hasFocusItems };
  });
}

function repoFields(
  scanned: ScannedProject
): Pick<ProjectInfo, "localPath" | "remote" | "branch" | "gitStatus" | "title" | "stack" | "readmeSummary"> {
  return {
    localPath: scanned.localPath,
    remote: scanned.remote,
    branch: scanned.branch,
    gitStatus: scanned.gitStatus,
    title: scanned.title,
    stack: scanned.stack,
    readmeSummary: scanned.readmeSummary ?? undefined,
  };
}
