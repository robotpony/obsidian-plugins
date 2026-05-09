import { App, TFile, TFolder, Events, debounce } from "obsidian";
import { HugoContentItem, HugoFrontmatter } from "./types";
import {
  parseFrontmatter,
  parseHugoDate,
  normalizeTags,
  getFolderFromPath,
  getTitleFromItem,
  getTopLevelFolder,
  getSubfolderTags,
} from "./utils";

export class HugoScanner extends Events {
  private app: App;
  private contentPaths: string[];
  private contentCache: Map<string, HugoContentItem> = new Map();
  private folderCache: Set<string> = new Set();
  private debouncedScanFile: (file: TFile) => void;

  constructor(app: App, contentPaths: string[]) {
    super();
    this.app = app;
    this.contentPaths = contentPaths;

    this.debouncedScanFile = debounce(
      (file: TFile) => this.scanFile(file),
      100,
      true
    );
  }

  /**
   * Update content paths (called when settings change)
   */
  setContentPaths(paths: string[]): void {
    this.contentPaths = paths;
  }

  /**
   * Check if a file path is within one of the configured content paths
   * Supports "." or "/" to mean the entire vault
   */
  private isInContentPath(filePath: string): boolean {
    if (this.contentPaths.length === 0) {
      return true;
    }
    return this.contentPaths.some((contentPath) => {
      const normalized = contentPath.trim().replace(/\/$/, "");
      // "." or "/" or empty means scan entire vault
      if (normalized === "." || normalized === "/" || normalized === "") {
        return true;
      }
      return (
        filePath.startsWith(normalized + "/") ||
        filePath === normalized
      );
    });
  }

  /**
   * Scan all files in the vault that match content paths
   */
  async scanVault(): Promise<void> {
    this.contentCache.clear();
    this.folderCache.clear();

    // Scan all markdown files
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (this.isInContentPath(file.path)) {
        await this.scanFile(file);
      }
    }

    // Scan all folders
    this.scanFolders();

    this.trigger("content-updated");
  }

  /**
   * Scan all folders in the vault that match content paths
   */
  private scanFolders(): void {
    const folders = this.app.vault.getAllFolders();
    for (const folder of folders) {
      if (this.isInContentPath(folder.path)) {
        this.folderCache.add(folder.path);
      }
    }
  }

  /**
   * Scan a single file and update the cache
   */
  async scanFile(file: TFile): Promise<void> {
    if (!this.isInContentPath(file.path)) {
      this.contentCache.delete(file.path);
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      const frontmatter = parseFrontmatter(content);

      if (!frontmatter) {
        this.contentCache.delete(file.path);
        return;
      }

      const item = this.createContentItem(file, frontmatter);
      this.contentCache.set(file.path, item);
    } catch {
      this.contentCache.delete(file.path);
    }
  }

  /**
   * Create a HugoContentItem from a file and its frontmatter
   */
  private createContentItem(
    file: TFile,
    frontmatter: HugoFrontmatter
  ): HugoContentItem {
    const tags = normalizeTags(frontmatter.tags);
    const categories = normalizeTags(frontmatter.categories);

    return {
      file,
      filePath: file.path,
      folder: getFolderFromPath(file.path),
      frontmatter,
      title: getTitleFromItem(frontmatter, file.path),
      date: parseHugoDate(frontmatter.date),
      isDraft: frontmatter.draft === true,
      tags,
      categories,
      description:
        typeof frontmatter.description === "string"
          ? frontmatter.description
          : "",
      topLevelFolder: getTopLevelFolder(file.path, this.contentPaths),
      folderTags: getSubfolderTags(file.path, this.contentPaths),
    };
  }

  /**
   * Watch for file changes and update cache
   */
  watchFiles(): void {
    this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.debouncedScanFile(file);
        this.trigger("content-updated");
      }
    });

    this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.debouncedScanFile(file);
        this.trigger("content-updated");
      } else if (file instanceof TFolder) {
        if (this.isInContentPath(file.path)) {
          this.folderCache.add(file.path);
          this.trigger("content-updated");
        }
      }
    });

    this.app.vault.on("delete", (file) => {
      if (file instanceof TFile) {
        this.contentCache.delete(file.path);
        this.trigger("content-updated");
      } else if (file instanceof TFolder) {
        this.folderCache.delete(file.path);
        this.trigger("content-updated");
      }
    });

    this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile && file.extension === "md") {
        this.contentCache.delete(oldPath);
        this.debouncedScanFile(file);
        this.trigger("content-updated");
      } else if (file instanceof TFolder) {
        this.folderCache.delete(oldPath);
        if (this.isInContentPath(file.path)) {
          this.folderCache.add(file.path);
        }
        this.trigger("content-updated");
      }
    });
  }

  /**
   * Get all content items
   */
  getContent(): HugoContentItem[] {
    return Array.from(this.contentCache.values());
  }

  /**
   * Get content filtered by draft status
   */
  getContentByStatus(isDraft: boolean): HugoContentItem[] {
    return this.getContent().filter((item) => item.isDraft === isDraft);
  }

  /**
   * Get content sorted by date (newest first by default)
   */
  getContentSorted(
    order: "date-desc" | "date-asc" | "title" = "date-desc"
  ): HugoContentItem[] {
    const items = this.getContent();

    switch (order) {
      case "date-desc":
        return items.sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return b.date.getTime() - a.date.getTime();
        });
      case "date-asc":
        return items.sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return a.date.getTime() - b.date.getTime();
        });
      case "title":
        return items.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return items;
    }
  }

  /**
   * Get all unique tags across all content
   */
  getAllTags(): string[] {
    const tagSet = new Set<string>();
    for (const item of this.contentCache.values()) {
      for (const tag of item.tags) {
        tagSet.add(tag);
      }
      for (const cat of item.categories) {
        tagSet.add(cat);
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Get all unique folder tags across all content
   */
  getAllFolderTags(): string[] {
    const tagSet = new Set<string>();
    for (const item of this.contentCache.values()) {
      for (const tag of item.folderTags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Get all unique folders (top-level + subfolder tags) for filtering
   */
  getAllFolders(): string[] {
    const folderSet = new Set<string>();
    for (const item of this.contentCache.values()) {
      // Add top-level folder (except "(root)")
      if (item.topLevelFolder !== "(root)") {
        folderSet.add(item.topLevelFolder);
      }
      // Add subfolder tags
      for (const tag of item.folderTags) {
        folderSet.add(tag);
      }
    }
    return Array.from(folderSet).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Get folder hierarchy as a flat list with depth for display
   * Returns folders with their full path and nesting depth
   * Merges folders derived from files with actual folders from the vault
   */
  getFolderHierarchy(): { name: string; path: string; depth: number }[] {
    // Build a set of all full folder paths from content items
    const pathSet = new Set<string>();

    // Add folders derived from file paths
    for (const item of this.contentCache.values()) {
      if (item.topLevelFolder === "(root)") continue;

      // Build full paths: top-level, top-level/sub1, top-level/sub1/sub2, etc.
      let currentPath = item.topLevelFolder;
      pathSet.add(currentPath);

      for (const subFolder of item.folderTags) {
        currentPath = `${currentPath}/${subFolder}`;
        pathSet.add(currentPath);
      }
    }

    // Add actual folders from the vault (includes empty folders)
    for (const folderPath of this.folderCache) {
      pathSet.add(folderPath);
      // Also add parent folders to ensure hierarchy is complete
      const parts = folderPath.split("/");
      let currentPath = "";
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        pathSet.add(currentPath);
      }
    }

    // Convert to sorted array
    const paths = Array.from(pathSet).sort((a, b) => a.localeCompare(b));

    // Convert to hierarchy items with depth
    return paths.map((path) => {
      const parts = path.split("/");
      return {
        name: parts[parts.length - 1], // Just the folder name
        path: path, // Full path for filtering
        depth: parts.length - 1, // 0 for top-level, 1 for first sublevel, etc.
      };
    });
  }

  /**
   * Get all unique top-level folders
   */
  getTopLevelFolders(): string[] {
    const folderSet = new Set<string>();
    for (const item of this.contentCache.values()) {
      folderSet.add(item.topLevelFolder);
    }
    return Array.from(folderSet).sort((a, b) => {
      // Sort "(root)" to the end
      if (a === "(root)") return 1;
      if (b === "(root)") return -1;
      return a.localeCompare(b);
    });
  }

  /**
   * Get content count
   */
  getCount(): { total: number; drafts: number; published: number } {
    const items = this.getContent();
    const drafts = items.filter((item) => item.isDraft).length;
    return {
      total: items.length,
      drafts,
      published: items.length - drafts,
    };
  }
}
