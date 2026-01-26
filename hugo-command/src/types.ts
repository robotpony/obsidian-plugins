import { TFile } from "obsidian";

/**
 * Hugo frontmatter fields we parse and display
 */
export interface HugoFrontmatter {
  title?: string;
  date?: string;
  draft?: boolean;
  tags?: string[];
  categories?: string[];
  description?: string;
  [key: string]: unknown;
}

/**
 * Represents a Hugo content item with parsed metadata
 */
export interface HugoContentItem {
  file: TFile;
  filePath: string;
  folder: string;
  frontmatter: HugoFrontmatter;
  // Computed/normalized properties
  title: string;
  date: Date | null;
  isDraft: boolean;
  tags: string[];
  categories: string[];
  description: string;
  // Folder organization
  topLevelFolder: string;
  folderTags: string[];
}

/**
 * Plugin settings
 */
export interface HugoCommandSettings {
  contentPaths: string[];
  trashFolder: string;
  showSidebarByDefault: boolean;
  showDrafts: boolean;
  defaultSortOrder: "date-desc" | "date-asc" | "title";
  defaultStatusFilter: StatusFilter;
}

export const DEFAULT_SETTINGS: HugoCommandSettings = {
  contentPaths: ["content"],
  trashFolder: "_trash",
  showSidebarByDefault: true,
  showDrafts: true,
  defaultSortOrder: "date-desc",
  defaultStatusFilter: "draft",
};

export type StatusFilter = "all" | "draft" | "published";
