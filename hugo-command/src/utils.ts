import { App, Notice, TFile, parseYaml, stringifyYaml } from "obsidian";
import { HugoFrontmatter, HugoContentItem, HugoSiteConfig } from "./types";

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
 * Format a date for display (e.g., "Jan-12-2025")
 */
export function formatDate(date: Date | null): string {
  if (!date) {
    return "";
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();

  return `${month}-${day}-${year}`;
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

/**
 * Get the relative path from a file path, stripping any matching content path prefix
 */
function getRelativePath(filePath: string, contentPaths: string[]): string {
  for (const contentPath of contentPaths) {
    const normalized = contentPath.trim().replace(/\/$/, "");
    // "." or "/" or empty means scan entire vault - use full path
    if (normalized === "." || normalized === "/" || normalized === "") {
      return filePath;
    }
    if (filePath.startsWith(normalized + "/")) {
      return filePath.substring(normalized.length + 1);
    }
  }
  return filePath;
}

/**
 * Get the top-level folder from a file path (relative to content paths)
 * Returns "(root)" for files not in any subfolder
 */
export function getTopLevelFolder(filePath: string, contentPaths: string[]): string {
  const relativePath = getRelativePath(filePath, contentPaths);
  const parts = relativePath.split("/");

  // If only one part (the filename), file is at root
  if (parts.length <= 1) {
    return "(root)";
  }

  return parts[0];
}

/**
 * Get subfolder paths as tags (all folders between top-level and the file)
 */
export function getSubfolderTags(filePath: string, contentPaths: string[]): string[] {
  const relativePath = getRelativePath(filePath, contentPaths);
  const parts = relativePath.split("/");

  // Need at least 3 parts: top-level folder, subfolder(s), filename
  if (parts.length <= 2) {
    return [];
  }

  // Return all middle parts (exclude first folder and last filename)
  return parts.slice(1, parts.length - 1);
}

/**
 * Convert a title to a URL-friendly slug for filenames
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars except spaces and hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Generate Hugo frontmatter template for a new post
 */
export function generateHugoFrontmatter(title: string): string {
  const now = new Date();
  const dateStr = now.toISOString();

  return `---
title: "${title}"
date: ${dateStr}
draft: true
tags: []
categories: []
description: ""
---

`;
}

/**
 * Hugo config file names in order of preference
 */
export const HUGO_CONFIG_FILES = [
  "hugo.toml",
  "hugo.yaml",
  "hugo.yml",
  "config.toml",
  "config.yaml",
  "config.yml",
];

/**
 * Find the Hugo config file in the vault root
 */
export async function findHugoConfigFile(app: App): Promise<TFile | null> {
  for (const filename of HUGO_CONFIG_FILES) {
    const file = app.vault.getAbstractFileByPath(filename);
    if (file instanceof TFile) {
      return file;
    }
  }
  return null;
}

/**
 * Detect config file format from filename
 */
export function getConfigFormat(filename: string): "toml" | "yaml" {
  if (filename.endsWith(".toml")) {
    return "toml";
  }
  return "yaml";
}

/**
 * Simple TOML parser for Hugo config files
 * Handles basic key-value pairs, strings, numbers, booleans, and [sections]
 */
export function parseToml(content: string): HugoSiteConfig {
  const result: HugoSiteConfig = {};
  let currentSection: Record<string, unknown> = result;
  let currentSectionName = "";

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Section header [section] or [section.subsection]
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const sectionPath = sectionMatch[1].split(".");
      currentSectionName = sectionPath[0];

      // Navigate/create nested sections
      currentSection = result;
      for (const part of sectionPath) {
        if (!currentSection[part]) {
          currentSection[part] = {};
        }
        currentSection = currentSection[part] as Record<string, unknown>;
      }
      continue;
    }

    // Key-value pair
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const rawValue = kvMatch[2].trim();
      currentSection[key] = parseTomlValue(rawValue);
    }
  }

  return result;
}

/**
 * Parse a single TOML value
 */
function parseTomlValue(value: string): unknown {
  // String (double or single quoted)
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Multi-line string (triple quotes) - just take single line for now
  if (value.startsWith('"""') || value.startsWith("'''")) {
    const quote = value.substring(0, 3);
    const endIdx = value.indexOf(quote, 3);
    if (endIdx > 0) {
      return value.substring(3, endIdx);
    }
    return value.substring(3);
  }

  // Boolean
  if (value === "true") return true;
  if (value === "false") return false;

  // Number
  const num = Number(value);
  if (!isNaN(num)) {
    return num;
  }

  // Array (basic support)
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    // Simple comma-separated values
    return inner.split(",").map((v) => parseTomlValue(v.trim()));
  }

  // Default to string
  return value;
}

/**
 * Serialize config back to TOML format
 */
export function serializeToml(config: HugoSiteConfig): string {
  const lines: string[] = [];

  // Top-level keys first (excluding nested objects)
  for (const [key, value] of Object.entries(config)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      lines.push(`${key} = ${tomlValue(value)}`);
    }
  }

  // Then sections
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      lines.push("");
      lines.push(`[${key}]`);
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        if (typeof subValue !== "object" || subValue === null || Array.isArray(subValue)) {
          lines.push(`${subKey} = ${tomlValue(subValue)}`);
        }
      }
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Convert a value to TOML string representation
 */
function tomlValue(value: unknown): string {
  if (typeof value === "string") {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(tomlValue).join(", ")}]`;
  }
  return '""';
}

/**
 * Parse Hugo config file content based on format
 */
export function parseHugoConfig(content: string, format: "toml" | "yaml"): HugoSiteConfig {
  if (format === "yaml") {
    try {
      const parsed = parseYaml(content);
      return (parsed as HugoSiteConfig) || {};
    } catch {
      return {};
    }
  }
  return parseToml(content);
}

/**
 * Serialize Hugo config to string based on format
 */
export function serializeHugoConfig(config: HugoSiteConfig, format: "toml" | "yaml"): string {
  if (format === "yaml") {
    return stringifyYaml(config);
  }
  return serializeToml(config);
}
