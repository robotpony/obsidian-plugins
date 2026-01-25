import { App, Notice, TFile, parseYaml } from "obsidian";
import { HugoFrontmatter, HugoContentItem } from "./types";

export const LOGO_PREFIX = "H\u2318";

/**
 * Show a notice with the Hugo Command logo prefix
 */
export function showNotice(message: string, timeout?: number): Notice {
  return new Notice(`${LOGO_PREFIX} ${message}`, timeout);
}

/**
 * Parse YAML frontmatter from markdown content
 */
export function parseFrontmatter(content: string): HugoFrontmatter | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return null;
  }

  try {
    const yaml = parseYaml(match[1]);
    if (typeof yaml !== "object" || yaml === null) {
      return null;
    }
    return yaml as HugoFrontmatter;
  } catch {
    return null;
  }
}

/**
 * Parse various date formats commonly used in Hugo frontmatter
 */
export function parseHugoDate(dateStr: string | undefined): Date | null {
  if (!dateStr) {
    return null;
  }

  // Handle various formats:
  // - ISO 8601: 2024-01-15T10:30:00Z
  // - Date only: 2024-01-15
  // - With timezone: 2024-01-15T10:30:00+05:00
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}

/**
 * Format a date for display
 */
export function formatDate(date: Date | null, format: string = "YYYY-MM-DD"): string {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return format
    .replace("YYYY", String(year))
    .replace("MM", month)
    .replace("DD", day);
}

/**
 * Normalize tags from frontmatter (handle both arrays and strings)
 */
export function normalizeTags(tags: unknown): string[] {
  if (!tags) {
    return [];
  }
  if (Array.isArray(tags)) {
    return tags.filter((t) => typeof t === "string").map((t) => String(t));
  }
  if (typeof tags === "string") {
    return [tags];
  }
  return [];
}

/**
 * Extract all unique tags from a list of content items
 */
export function extractAllTags(items: HugoContentItem[]): string[] {
  const tagSet = new Set<string>();
  for (const item of items) {
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
 * Open a file in the editor
 */
export async function openFile(app: App, file: TFile): Promise<void> {
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);
}

/**
 * Get the folder path from a file path
 */
export function getFolderFromPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }
  return filePath.substring(0, lastSlash);
}

/**
 * Get title from frontmatter or filename
 */
export function getTitleFromItem(frontmatter: HugoFrontmatter, filePath: string): string {
  if (frontmatter.title && typeof frontmatter.title === "string") {
    return frontmatter.title;
  }
  // Extract filename without extension
  const lastSlash = filePath.lastIndexOf("/");
  const filename = lastSlash === -1 ? filePath : filePath.substring(lastSlash + 1);
  return filename.replace(/\.md$/, "");
}
