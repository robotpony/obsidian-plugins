import { App, TFile } from "obsidian";
import TurndownService from "turndown";
import { DriveProvider } from "./DriveProvider";
import { DriveFile, ExportFormat, GCommandSettings, SyncRecord } from "./types";

const TAG = "[G Command]";

interface SyncResult {
  synced: number;
  skipped: number;
  failed: string[];
}

interface FormatMapping {
  exportFormat?: ExportFormat;
  extension: string;
  convert: "turndown" | "passthrough";
  addFrontmatter: boolean;
}

/** Determine export format, target extension, and conversion for a Drive file. */
export function getFormatMapping(file: DriveFile): FormatMapping {
  const mime = file.MimeType;

  if (mime === "application/vnd.google-apps.document") {
    return { exportFormat: "html", extension: ".md", convert: "turndown", addFrontmatter: true };
  }
  if (mime === "application/vnd.google-apps.spreadsheet") {
    return { exportFormat: "csv", extension: ".csv", convert: "passthrough", addFrontmatter: false };
  }
  if (mime === "application/vnd.google-apps.presentation") {
    return { exportFormat: "txt", extension: ".md", convert: "passthrough", addFrontmatter: true };
  }

  // Native file — keep original extension
  const dotIdx = file.Name.lastIndexOf(".");
  const ext = dotIdx > 0 ? file.Name.substring(dotIdx) : "";
  return { exportFormat: undefined, extension: ext, convert: "passthrough", addFrontmatter: false };
}

/** Strip rclone's virtual extensions (.gdoc, .gsheet, .gslides, .gform) from a filename. */
export function stripVirtualExt(name: string): string {
  return name.replace(/\.(gdoc|gsheet|gslides|gform)$/, "");
}

/** Replace characters that are invalid in Obsidian/filesystem paths. */
export function sanitizeFilename(name: string): string {
  let s = name
    .replace(/[<>:"|?*\\]/g, "_")
    .replace(/^\./, "_")
    .trim();
  return s || "_";
}

/** Compute the vault-relative path for a synced Drive file. */
export function toVaultPath(file: DriveFile, vaultRoot: string): string {
  const mapping = getFormatMapping(file);
  const stripped = stripVirtualExt(file.Name);

  // For virtual extensions (.gdoc etc), stripped name + new extension
  // For native files, stripped === original name (already has extension)
  const baseName = stripped !== file.Name
    ? `${stripped}${mapping.extension}`
    : stripped;
  const fileName = sanitizeFilename(baseName);

  const dirParts = file.Path.split("/");
  dirParts.pop(); // remove filename
  const sanitizedDirs = dirParts.filter(p => p.length > 0).map(sanitizeFilename);
  const dir = sanitizedDirs.length > 0 ? sanitizedDirs.join("/") : "";

  const fullDir = dir ? `${vaultRoot}/${dir}` : vaultRoot;
  return `${fullDir}/${fileName}`;
}

/** Build YAML frontmatter block for a synced .md file. */
export function buildFrontmatter(file: DriveFile): string {
  const now = new Date().toISOString();
  return [
    "---",
    `gdrive_id: "${file.ID}"`,
    `gdrive_path: "${file.Path}"`,
    `synced: "${now}"`,
    "---",
    "",
  ].join("\n");
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/** Convert downloaded content to vault-ready content. */
export function convertContent(
  raw: string,
  mapping: FormatMapping,
  file: DriveFile
): string {
  let content: string;

  if (mapping.convert === "turndown") {
    content = turndown.turndown(raw);
  } else {
    content = raw;
  }

  if (mapping.addFrontmatter) {
    content = buildFrontmatter(file) + content;
  }

  return content;
}

/**
 * Sync a list of Drive files to the vault.
 * Downloads each file, converts it, writes it, and updates syncState.
 */
export async function syncFiles(
  files: DriveFile[],
  app: App,
  drive: DriveProvider,
  settings: GCommandSettings,
  saveSettings: () => Promise<void>,
): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, skipped: 0, failed: [] };

  for (const file of files) {
    if (file.IsDir) continue;

    try {
      // Skip if unchanged
      const existing = settings.syncState[file.Path];
      if (existing && existing.modTime === file.ModTime) {
        result.skipped++;
        continue;
      }

      const mapping = getFormatMapping(file);
      const raw = await drive.cat(file.Path, mapping.exportFormat);
      const content = convertContent(raw, mapping, file);
      const vaultPath = toVaultPath(file, settings.vaultRoot);

      await writeToVault(app, vaultPath, content);

      // Update sync state
      settings.syncState[file.Path] = {
        modTime: file.ModTime,
        vaultPath,
        fileId: file.ID,
      };
      await saveSettings();

      result.synced++;
      console.log(TAG, `Synced: ${file.Path} → ${vaultPath}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(TAG, `Failed to sync ${file.Path}:`, msg);
      result.failed.push(file.Path);
    }
  }

  return result;
}

/** Write content to a vault path, creating parent folders as needed. */
async function writeToVault(app: App, path: string, content: string): Promise<void> {
  // Ensure parent folder exists
  const parts = path.split("/");
  parts.pop();
  const folderPath = parts.join("/");
  if (folderPath) {
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await app.vault.createFolder(folderPath);
    }
  }

  // Create or overwrite file
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing && existing instanceof TFile) {
    await app.vault.modify(existing, content);
  } else {
    await app.vault.create(path, content);
  }
}
