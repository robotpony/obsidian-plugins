#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { discoverVaults, VaultInfo } from "./vault-discovery.js";
import { listVaultFiles, readVaultFile, searchVault, parseFrontmatter } from "./vault-provider.js";
import { extractSections, convertContent, buildFrontmatter, getFormatMapping, toVaultPath, driveEditUrl } from "../convert/index.js";
import type { ConvertFile } from "../convert/types.js";
import { downloadDriveFile, readVaultRoot, updateSyncState } from "./pull-helpers.js";

const execFileAsync = promisify(execFile);

// rclone remote name — must match what was created in `rclone config`
const REMOTE = process.env.GDRIVE_RCLONE_REMOTE ?? "gdrive";

// 50 MB buffer for large documents and directory listings
const MAX_BUFFER = 50 * 1024 * 1024;

interface RcloneFile {
  Path: string;
  Name: string;
  Size: number;
  MimeType: string;
  ModTime: string;
  IsDir: boolean;
  ID: string;
}

// Cached vault list — refreshed on list-vaults call
let cachedVaults: VaultInfo[] = [];

function findVault(name: string): VaultInfo | undefined {
  return cachedVaults.find(v => v.name === name);
}

async function runRclone(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("rclone", args, { maxBuffer: MAX_BUFFER });
  return stdout;
}

// Determine rclone export format flag args based on the file path/mime type.
function exportArgs(filePath: string): string[] {
  if (filePath.endsWith(".gdoc")) {
    return ["--drive-export-formats", "txt"];
  }
  if (filePath.endsWith(".gsheet")) {
    return ["--drive-export-formats", "csv"];
  }
  if (filePath.endsWith(".gslides") || filePath.endsWith(".gform")) {
    return ["--drive-export-formats", "txt"];
  }
  return [];
}

function mimeTypeForPath(filePath: string): string {
  if (filePath.endsWith(".gsheet")) return "text/csv";
  return "text/plain";
}

const server = new Server(
  { name: "g-command/vault", version: "1.3.0" },
  { capabilities: { resources: {}, tools: {} } },
);

// ─── Resources ──────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
  const cursor = request.params?.cursor as string | undefined;

  // If cursor starts with "vault:", list files from that vault
  if (cursor?.startsWith("vault:")) {
    const vaultName = cursor.substring(6);
    const vault = findVault(vaultName);
    if (!vault) {
      return { resources: [] };
    }
    const files = await listVaultFiles(vault);
    return {
      resources: files.map(f => ({
        uri: `vault://${vault.name}/${f.path}`,
        mimeType: f.path.endsWith(".md") ? "text/markdown" : "text/plain",
        name: f.path,
      })),
    };
  }

  // Default: list Drive files (existing behaviour)
  const folder = cursor ?? "";
  const rclonePath = folder ? `${REMOTE}:${folder}` : `${REMOTE}:`;

  const output = await runRclone(["lsjson", rclonePath, "--max-depth", "1"]);
  const files: RcloneFile[] = JSON.parse(output);

  // Include vault cursors so callers can browse into vaults
  const vaultResources = cachedVaults.map(v => ({
    uri: `vault://${v.name}/`,
    mimeType: "inode/directory",
    name: `${v.name} (vault)`,
  }));

  return {
    resources: [
      ...vaultResources,
      ...files.map((f) => ({
        uri: `gdrive:///${f.Path}`,
        mimeType: f.IsDir ? "inode/directory" : f.MimeType,
        name: f.Name,
      })),
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  // Handle vault:// URIs
  if (uri.startsWith("vault://")) {
    const withoutScheme = uri.substring(8); // remove "vault://"
    const slashIdx = withoutScheme.indexOf("/");
    if (slashIdx === -1) {
      throw new Error(`Invalid vault URI: ${uri}. Expected vault://{name}/{path}`);
    }

    const vaultName = withoutScheme.substring(0, slashIdx);
    let filePath = withoutScheme.substring(slashIdx + 1);

    // Parse ?sections= query parameter
    let sectionSelectors: (string | number)[] | null = null;
    const qIdx = filePath.indexOf("?");
    if (qIdx !== -1) {
      const queryStr = filePath.substring(qIdx + 1);
      filePath = filePath.substring(0, qIdx);
      const params = new URLSearchParams(queryStr);
      const sectionsParam = params.get("sections");
      if (sectionsParam) {
        sectionSelectors = sectionsParam.split(",").map(s => {
          const trimmed = s.trim();
          const num = Number(trimmed);
          return !isNaN(num) && trimmed.length > 0 ? num : trimmed;
        });
      }
    }

    const vault = findVault(vaultName);
    if (!vault) {
      throw new Error(`Vault not found: "${vaultName}". Use the list-vaults tool to see available vaults.`);
    }

    const file = await readVaultFile(vault, filePath);

    let responseContent: string;
    if (sectionSelectors && sectionSelectors.length > 0) {
      const result = extractSections(file.content, sectionSelectors);
      responseContent = JSON.stringify({
        content: result.content,
        sections_returned: result.sections_returned,
        not_found: result.not_found,
        available_headings: result.available_headings,
        frontmatter: file.frontmatter,
        path: file.path,
        vault: file.vault,
        modified: file.modified,
      }, null, 2);
    } else {
      responseContent = JSON.stringify({
        content: file.content,
        frontmatter: file.frontmatter,
        path: file.path,
        vault: file.vault,
        modified: file.modified,
      }, null, 2);
    }

    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: responseContent,
      }],
    };
  }

  // Handle gdrive:// URIs (existing)
  const filePath = uri.replace("gdrive:///", "");
  const rclonePath = `${REMOTE}:${filePath}`;
  const args = ["cat", ...exportArgs(filePath), rclonePath];
  const content = await runRclone(args);

  return {
    contents: [{
      uri,
      mimeType: mimeTypeForPath(filePath),
      text: content,
    }],
  };
});

// ─── Tools ──────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search",
      description:
        "Search for files by filename or content. " +
        "Use scope='drive' for Drive filename search, scope='vault' for vault content search (fuzzy), " +
        "or scope='both' for combined results.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search term (filename match for Drive, fuzzy match for vault)",
          },
          scope: {
            type: "string",
            enum: ["drive", "vault", "both"],
            description: "Where to search. Default: 'drive' (backwards compatible)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "list-vaults",
      description:
        "List all Obsidian vaults registered on this machine. " +
        "Returns vault names, filesystem paths, and whether each vault is currently open.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "pull",
      description:
        "Pull a file from Google Drive into an Obsidian vault. " +
        "Searches Drive, downloads the file (HTML export for Docs, CSV for Sheets), " +
        "converts to markdown, writes to the vault, and updates sync state. " +
        "If query matches multiple files, returns the list for you to pick one and call again with path.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Document name to search for on Drive",
          },
          path: {
            type: "string",
            description: "Exact Drive path (skips search). Use when you know the path or picked from a previous search result.",
          },
          vault: {
            type: "string",
            description: "Target vault name. Defaults to the first open vault, or first vault if none are open.",
          },
          sections: {
            type: "array",
            items: { oneOf: [{ type: "string" }, { type: "integer" }] },
            description: "Optional section filter — heading names or numeric indices. Only matching sections are written to the vault file.",
          },
        },
        required: ["query"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;

  if (toolName === "list-vaults") {
    // Refresh vault list
    cachedVaults = await discoverVaults();
    const list = cachedVaults.map(v =>
      `${v.name}: ${v.path}${v.open ? " (open)" : ""}`
    ).join("\n");

    return {
      content: [{
        type: "text",
        text: cachedVaults.length > 0
          ? `Found ${cachedVaults.length} vault(s):\n${list}`
          : "No Obsidian vaults found. Is Obsidian installed?",
      }],
      isError: false,
    };
  }

  if (toolName === "search") {
    const term = request.params.arguments?.query as string;
    if (!term) {
      throw new Error("query argument is required");
    }
    const scope = (request.params.arguments?.scope as string) ?? "drive";

    const parts: string[] = [];

    // Drive search
    if (scope === "drive" || scope === "both") {
      try {
        const output = await runRclone([
          "lsjson", `${REMOTE}:`, "--include", `*${term}*`, "--recursive", "--files-only",
        ]);
        const files: RcloneFile[] = JSON.parse(output);
        const list = files.map(f => `${f.Path} (${f.MimeType})`).join("\n");
        parts.push(
          files.length > 0
            ? `Drive: ${files.length} file(s)\n${list}`
            : `Drive: no files matching "${term}"`,
        );
      } catch (err: any) {
        parts.push(`Drive search error: ${err.message ?? err}`);
      }
    }

    // Vault search
    if (scope === "vault" || scope === "both") {
      if (cachedVaults.length === 0) {
        cachedVaults = await discoverVaults();
      }
      const allResults: string[] = [];
      for (const vault of cachedVaults) {
        const results = await searchVault(vault, term);
        for (const r of results) {
          allResults.push(`vault://${r.vault}/${r.path} (score: ${r.score.toFixed(2)}) — ${r.snippet}`);
        }
      }
      parts.push(
        allResults.length > 0
          ? `Vault: ${allResults.length} result(s)\n${allResults.join("\n")}`
          : `Vault: no results matching "${term}"`,
      );
    }

    return {
      content: [{ type: "text", text: parts.join("\n\n") }],
      isError: false,
    };
  }

  if (toolName === "pull") {
    const query = request.params.arguments?.query as string;
    const path = request.params.arguments?.path as string | undefined;
    const vaultName = request.params.arguments?.vault as string | undefined;
    const sections = request.params.arguments?.sections as (string | number)[] | undefined;

    if (!query && !path) {
      throw new Error("Either query or path argument is required");
    }

    // Resolve target vault
    if (cachedVaults.length === 0) {
      cachedVaults = await discoverVaults();
    }
    let vault: VaultInfo | undefined;
    if (vaultName) {
      vault = findVault(vaultName);
      if (!vault) {
        throw new Error(`Vault not found: "${vaultName}". Use list-vaults to see available vaults.`);
      }
    } else {
      vault = cachedVaults.find(v => v.open) ?? cachedVaults[0];
      if (!vault) {
        throw new Error("No Obsidian vaults found. Is Obsidian installed?");
      }
    }

    // Resolve Drive file — either by path or search
    let driveFile: RcloneFile;
    if (path) {
      // Fetch metadata for the specific file
      const parentDir = path.substring(0, path.lastIndexOf("/")) || "";
      const fileName = path.substring(path.lastIndexOf("/") + 1);
      const rclonePath = parentDir ? `${REMOTE}:${parentDir}` : `${REMOTE}:`;
      const output = await runRclone(["lsjson", rclonePath, "--include", fileName, "--files-only"]);
      const files: RcloneFile[] = JSON.parse(output);
      const match = files.find(f => f.Path === path || f.Name === fileName);
      if (!match) {
        throw new Error(`File not found on Drive: "${path}"`);
      }
      driveFile = match;
    } else {
      // Search Drive
      const output = await runRclone([
        "lsjson", `${REMOTE}:`, "--include", `*${query}*`, "--recursive", "--files-only",
      ]);
      const files: RcloneFile[] = JSON.parse(output);

      if (files.length === 0) {
        return {
          content: [{ type: "text", text: `No files matching "${query}" found on Drive.` }],
          isError: false,
        };
      }

      if (files.length > 1) {
        const list = files.map(f => `  ${f.Path} (${f.MimeType})`).join("\n");
        return {
          content: [{
            type: "text",
            text: `Multiple matches for "${query}" — call again with the exact path:\n${list}`,
          }],
          isError: false,
        };
      }

      driveFile = files[0];
    }

    // Determine format mapping and download
    const convertFile: ConvertFile = driveFile;
    const mapping = getFormatMapping(convertFile);

    console.error(`[pull] Downloading "${driveFile.Path}" (${driveFile.MimeType}), export=${mapping.exportFormat ?? "none"}`);
    const raw = await downloadDriveFile(REMOTE, driveFile.Path, mapping.exportFormat);

    // Convert
    let content = convertContent(raw, mapping, convertFile);

    // Apply section filter if requested
    let sectionInfo: { sections_returned: string[]; not_found: string[] } | undefined;
    if (sections && sections.length > 0) {
      const result = extractSections(content, sections);
      content = result.content;
      sectionInfo = {
        sections_returned: result.sections_returned,
        not_found: result.not_found,
      };

      // Re-add frontmatter if it was stripped by section extraction
      if (mapping.addFrontmatter) {
        content = buildFrontmatter(convertFile) + content;
      }
    }

    // Write to vault
    const vaultRoot = readVaultRoot(vault.path);
    const vaultRelPath = toVaultPath(convertFile, vaultRoot);
    const fullPath = join(vault.path, vaultRelPath);

    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, content, "utf-8");

    // Update syncState
    updateSyncState(vault.path, convertFile, vaultRelPath);

    const editUrl = driveEditUrl(convertFile);
    const result: Record<string, any> = {
      vaultPath: vaultRelPath,
      drivePath: driveFile.Path,
      vault: vault.name,
    };
    if (editUrl) result.driveUrl = editUrl;
    if (sectionInfo) {
      result.sections_returned = sectionInfo.sections_returned;
      if (sectionInfo.not_found.length > 0) {
        result.not_found = sectionInfo.not_found;
      }
    }

    return {
      content: [{
        type: "text",
        text: `Pulled "${driveFile.Name}" → ${vaultRelPath}\n\n${JSON.stringify(result, null, 2)}`,
      }],
      isError: false,
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
});

// ─── Startup ────────────────────────────────────────────────────────────────

async function checkRclone(): Promise<void> {
  try {
    await execFileAsync("rclone", ["version"], { maxBuffer: MAX_BUFFER });
  } catch {
    console.error(
      "Warning: rclone not found in PATH.\n" +
      "Drive features will be unavailable.\n" +
      "Install with:  brew install rclone\n" +
      "Then configure Google Drive:  rclone config"
    );
    // Don't exit — vault features still work without rclone
    return;
  }

  try {
    await runRclone(["lsjson", `${REMOTE}:`, "--max-depth", "1", "--files-only"]);
  } catch (err: any) {
    console.error(
      `Warning: could not connect to rclone remote "${REMOTE}".\n` +
      `Drive features may be unavailable.\n` +
      `Run:  rclone config\n` +
      `\nrclone error: ${err.message ?? err}`
    );
    // Don't exit — vault features still work
  }
}

async function main(): Promise<void> {
  // Discover vaults at startup
  cachedVaults = await discoverVaults();
  console.error(`Found ${cachedVaults.length} vault(s)`);

  await checkRclone();
  console.error(`MCP server ready (remote: ${REMOTE})`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
