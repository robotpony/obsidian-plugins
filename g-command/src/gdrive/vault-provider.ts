import { readFile, readdir, stat } from "fs/promises";
import { join, relative, extname } from "path";
import Fuse from "fuse.js";
import { VaultInfo } from "./vault-discovery.js";

export interface VaultFile {
  vault: string;
  path: string;         // relative to vault root
  modified: string;     // ISO 8601
  frontmatter: Record<string, unknown> | null;
  content: string;
}

export interface VaultSearchResult {
  vault: string;
  path: string;
  modified: string;
  score: number;        // 0 = perfect match, 1 = no match
  snippet: string;      // first ~200 chars of content
}

/**
 * Parse YAML frontmatter from a markdown file's content.
 * Simple line-based parser — handles key: value and key: "value" pairs.
 * Does not use a YAML library.
 */
export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown> | null; body: string } {
  if (!content.startsWith("---")) {
    return { frontmatter: null, body: content };
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: null, body: content };
  }

  const yamlBlock = content.substring(4, endIndex); // skip opening "---\n"
  const body = content.substring(endIndex + 4).replace(/^\n/, ""); // skip closing "---\n"
  const frontmatter: Record<string, unknown> = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim();
    let value: unknown = line.substring(colonIdx + 1).trim();

    if (!key) continue;

    // Unquote string values
    if (typeof value === "string" && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    // Parse simple arrays: [a, b, c]
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1).split(",").map(s => {
        const trimmed = s.trim();
        return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
      });
    }

    // Parse booleans and numbers
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) value = Number(value);

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

/** Recursively walk a directory and return all file paths. */
async function walkDir(dir: string, maxDepth = 10): Promise<string[]> {
  if (maxDepth <= 0) return [];
  const files: string[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    // Skip hidden directories and .obsidian
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;

    if (entry.isDirectory()) {
      const sub = await walkDir(fullPath, maxDepth - 1);
      files.push(...sub);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

/** List all files in a vault, returning relative paths and metadata. */
export async function listVaultFiles(vault: VaultInfo): Promise<{ path: string; modified: string }[]> {
  const filePaths = await walkDir(vault.path);
  const results: { path: string; modified: string }[] = [];

  for (const fp of filePaths) {
    try {
      const st = await stat(fp);
      results.push({
        path: relative(vault.path, fp),
        modified: st.mtime.toISOString(),
      });
    } catch {
      // Skip files we can't stat
    }
  }

  return results;
}

/** Read a single vault file with parsed frontmatter. */
export async function readVaultFile(vault: VaultInfo, filePath: string): Promise<VaultFile> {
  const fullPath = join(vault.path, filePath);
  const raw = await readFile(fullPath, "utf-8");
  const st = await stat(fullPath);

  const isMarkdown = extname(filePath) === ".md";
  const { frontmatter, body } = isMarkdown ? parseFrontmatter(raw) : { frontmatter: null, body: raw };

  return {
    vault: vault.name,
    path: filePath,
    modified: st.mtime.toISOString(),
    frontmatter,
    content: body,
  };
}

/** Index structure for fuzzy search. */
interface SearchEntry {
  vault: string;
  path: string;
  modified: string;
  content: string;
}

/**
 * Search vault files using fuse.js fuzzy matching.
 * Searches both filenames and content.
 */
export async function searchVault(
  vault: VaultInfo,
  query: string,
  maxResults = 20,
): Promise<VaultSearchResult[]> {
  const filePaths = await walkDir(vault.path);
  const entries: SearchEntry[] = [];

  for (const fp of filePaths) {
    const relPath = relative(vault.path, fp);
    // Only search text-based files
    const ext = extname(fp).toLowerCase();
    if (![".md", ".txt", ".csv", ".json", ".yaml", ".yml"].includes(ext)) continue;

    try {
      const raw = await readFile(fp, "utf-8");
      const st = await stat(fp);
      entries.push({
        vault: vault.name,
        path: relPath,
        modified: st.mtime.toISOString(),
        content: raw,
      });
    } catch {
      // Skip unreadable files
    }
  }

  const fuse = new Fuse(entries, {
    keys: [
      { name: "path", weight: 2 },
      { name: "content", weight: 1 },
    ],
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const results = fuse.search(query, { limit: maxResults });

  return results.map(r => ({
    vault: r.item.vault,
    path: r.item.path,
    modified: r.item.modified,
    score: r.score ?? 1,
    snippet: r.item.content.substring(0, 200).replace(/\n/g, " "),
  }));
}
