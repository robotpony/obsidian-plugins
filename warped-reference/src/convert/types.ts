/**
 * Minimal file shape needed by conversion functions.
 * Matches the subset of DriveFile used by format mapping, frontmatter, and path utilities.
 * No Obsidian dependencies — safe for use in the MCP server.
 */
export interface ConvertFile {
  Path: string;
  Name: string;
  Size: number;
  MimeType: string;
  ModTime: string;
  IsDir: boolean;
  ID: string;
}

export interface FormatMapping {
  exportFormat?: ExportFormat;
  extension: string;
  convert: "turndown" | "passthrough";
  addFrontmatter: boolean;
}

export type ExportFormat = "html" | "csv" | "txt";

export interface ExtractSectionsResult {
  content: string;
  sections_returned: string[];
  not_found: string[];
  available_headings: { index: number; level: number; text: string }[];
}
