import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import type { ConvertFile } from "../convert/types.js";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 50 * 1024 * 1024;

/**
 * Download a file from Drive via rclone copy --include.
 * Ports the pattern from DriveProvider.download().
 * Returns the raw file content as a string.
 */
export async function downloadDriveFile(
  remote: string,
  drivePath: string,
  exportFormat?: string,
): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), "gc-mcp-"));
  try {
    const lastSlash = drivePath.lastIndexOf("/");
    const parentDir = lastSlash > 0 ? drivePath.substring(0, lastSlash) : "";
    const fileName = lastSlash > 0 ? drivePath.substring(lastSlash + 1) : drivePath;

    // For exports, match the target extension not the virtual one
    let includeFilter = fileName;
    if (exportFormat) {
      const dotIdx = fileName.lastIndexOf(".");
      const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
      includeFilter = `${baseName}.${exportFormat}`;
    }

    // Escape rclone glob characters
    includeFilter = includeFilter.replace(/([[\]*?{}])/g, "\\$1");

    const remotePath = parentDir ? `${remote}:${parentDir}` : `${remote}:`;
    const args = ["copy", "--include", includeFilter];
    if (exportFormat) {
      args.push("--drive-export-formats", exportFormat);
    }
    args.push(remotePath, tmpDir);

    console.error(`[pull] rclone ${args.join(" ")}`);
    await execFileAsync("rclone", args, { maxBuffer: MAX_BUFFER });

    const files = readdirSync(tmpDir);
    if (files.length === 0) {
      throw new Error(
        `rclone copy produced no output for "${drivePath}"` +
        ` (include="${includeFilter}", exportFormat=${exportFormat ?? "none"})`,
      );
    }
    return readFileSync(join(tmpDir, files[0]), "utf-8");
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * Read vaultRoot from the plugin's data.json in a vault.
 * Falls back to "gdrive" if not found.
 */
export function readVaultRoot(vaultPath: string): string {
  const dataPath = join(vaultPath, ".obsidian", "plugins", "g-command", "data.json");
  try {
    const data = JSON.parse(readFileSync(dataPath, "utf-8"));
    return data.vaultRoot ?? "gdrive";
  } catch {
    return "gdrive";
  }
}

/**
 * Update the plugin's data.json syncState with a newly pulled file.
 */
export function updateSyncState(
  vaultPath: string,
  driveFile: ConvertFile,
  vaultRelPath: string,
): void {
  const dataPath = join(vaultPath, ".obsidian", "plugins", "g-command", "data.json");
  let data: Record<string, any> = {};
  try {
    data = JSON.parse(readFileSync(dataPath, "utf-8"));
  } catch { /* start fresh */ }

  if (!data.syncState) data.syncState = {};
  data.syncState[vaultRelPath] = {
    driveId: driveFile.ID,
    drivePath: driveFile.Path,
    mimeType: driveFile.MimeType,
    modTime: driveFile.ModTime,
    lastSync: new Date().toISOString(),
  };

  // Ensure the directory exists
  const dir = dirname(dataPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf-8");
}
