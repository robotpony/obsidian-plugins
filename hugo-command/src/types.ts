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
}

/**
 * Plugin settings
 */
export interface HugoCommandSettings {
  contentPaths: string[];
  showSidebarByDefault: boolean;
  showDrafts: boolean;
  defaultSortOrder: "date-desc" | "date-asc" | "title";
}

export const DEFAULT_SETTINGS: HugoCommandSettings = {
  contentPaths: ["."],
  showSidebarByDefault: true,
  showDrafts: true,
  defaultSortOrder: "date-desc",
};

export type StatusFilter = "all" | "draft" | "published";
