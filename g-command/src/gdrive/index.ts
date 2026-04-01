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

async function runRclone(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("rclone", args, { maxBuffer: MAX_BUFFER });
  return stdout;
}

// Determine rclone export format flag args based on the file path/mime type.
// rclone adds .gdoc/.gsheet/.gslides extensions to Google Workspace files.
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
  { name: "g-command/gdrive", version: "1.0.0" },
  { capabilities: { resources: {}, tools: {} } },
);

server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
  // cursor holds a subfolder path for pagination-by-folder
  const folder = (request.params?.cursor as string | undefined) ?? "";
  const rclonePath = folder ? `${REMOTE}:${folder}` : `${REMOTE}:`;

  const output = await runRclone(["lsjson", rclonePath, "--max-depth", "1"]);
  const files: RcloneFile[] = JSON.parse(output);

  return {
    resources: files.map((f) => ({
      uri: `gdrive:///${f.Path}`,
      mimeType: f.IsDir ? "inode/directory" : f.MimeType,
      name: f.Name,
    })),
    // Return folder path as next cursor so callers can browse into subdirectories
    nextCursor: undefined,
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const filePath = uri.replace("gdrive:///", "");
  const rclonePath = `${REMOTE}:${filePath}`;

  const args = ["cat", ...exportArgs(filePath), rclonePath];
  const content = await runRclone(args);

  return {
    contents: [
      {
        uri,
        mimeType: mimeTypeForPath(filePath),
        text: content,
      },
    ],
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search",
      description:
        "Search for files in Google Drive by filename. Returns matching file paths and types. " +
        "Note: this is a filename match, not a full-text content search.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Filename search term (partial, case-sensitive match)",
          },
        },
        required: ["query"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "search") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const term = request.params.arguments?.query as string;
  if (!term) {
    throw new Error("query argument is required");
  }

  const output = await runRclone([
    "lsjson",
    `${REMOTE}:`,
    "--include",
    `*${term}*`,
    "--recursive",
    "--files-only",
  ]);

  const files: RcloneFile[] = JSON.parse(output);
  const list = files.map((f) => `${f.Path} (${f.MimeType})`).join("\n");

  return {
    content: [
      {
        type: "text",
        text: files.length > 0
          ? `Found ${files.length} files:\n${list}`
          : `No files found matching "${term}"`,
      },
    ],
    isError: false,
  };
});

async function checkRclone(): Promise<void> {
  // Confirm rclone binary is available
  try {
    await execFileAsync("rclone", ["version"], { maxBuffer: MAX_BUFFER });
  } catch {
    console.error(
      "Error: rclone not found in PATH.\n" +
      "Install with:  brew install rclone\n" +
      "Then configure Google Drive:  rclone config"
    );
    process.exit(1);
  }

  // Confirm the Drive remote is configured and reachable
  try {
    await runRclone(["lsjson", `${REMOTE}:`, "--max-depth", "1", "--files-only"]);
  } catch (err: any) {
    console.error(
      `Error: could not connect to rclone remote "${REMOTE}".\n` +
      `Run:  rclone config\n` +
      `Create a remote named "${REMOTE}" with type "drive".\n` +
      `Or set GDRIVE_RCLONE_REMOTE to match your existing remote name.\n` +
      `\nrclone error: ${err.message ?? err}`
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  await checkRclone();
  console.error(`gdrive MCP server ready (remote: ${REMOTE})`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
