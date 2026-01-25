import { App, TFile, Events, debounce } from "obsidian";
import { HugoContentItem, HugoFrontmatter } from "./types";
import {
  parseFrontmatter,
  parseHugoDate,
  normalizeTags,
  getFolderFromPath,
  getTitleFromItem,
} from "./utils";

export class HugoScanner extends Events {
  private app: App;
  private contentPaths: string[];
  private contentCache: Map<string, HugoContentItem> = new Map();
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
   */
  private isInContentPath(filePath: string): boolean {
    if (this.contentPaths.length === 0) {
      return true;
    }
    return this.contentPaths.some((contentPath) => {
      const normalizedContentPath = contentPath.replace(/\/$/, "");
      return (
        filePath.startsWith(normalizedContentPath + "/") ||
        filePath === normalizedContentPath
      );
    });
  }

  /**
   * Scan all files in the vault that match content paths
   */
  async scanVault(): Promise<void> {
    this.contentCache.clear();

    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (this.isInContentPath(file.path)) {
        await this.scanFile(file);
      }
    }

    this.trigger("content-updated");
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
      }
    });

    this.app.vault.on("delete", (file) => {
      if (file instanceof TFile) {
        this.contentCache.delete(file.path);
        this.trigger("content-updated");
      }
    });

    this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile && file.extension === "md") {
        this.contentCache.delete(oldPath);
        this.debouncedScanFile(file);
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
