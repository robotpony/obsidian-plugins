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

export type SyncLogFn = (level: "info" | "error", message: string) => void;

const noop: SyncLogFn = () => {};

interface FormatMapping {
  exportFormat?: ExportFormat;
  extension: string;
  convert: "turndown" | "passthrough";
  addFrontmatter: boolean;
}

// Office MIME types that rclone uses when exporting Google Workspace files.
// These appear when rclone's --drive-export-formats includes docx/xlsx/pptx.
const OFFICE_DOC_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);
const OFFICE_SHEET_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const OFFICE_SLIDES_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
]);

/** Determine export format, target extension, and conversion for a Drive file. */
export function getFormatMapping(file: DriveFile): FormatMapping {
  const mime = file.MimeType;
  const isVirtual = file.Size === -1; // Google Workspace files have Size -1

  // Google-native MIME types (always virtual)
  if (mime === "application/vnd.google-apps.document") {
    return { exportFormat: "html", extension: ".md", convert: "turndown", addFrontmatter: true };
  }
  if (mime === "application/vnd.google-apps.spreadsheet") {
    return { exportFormat: "csv", extension: ".csv", convert: "passthrough", addFrontmatter: false };
  }
  if (mime === "application/vnd.google-apps.presentation") {
    return { exportFormat: "txt", extension: ".md", convert: "passthrough", addFrontmatter: true };
  }

  // Office MIME types with Size -1 = Google Workspace file exported as Office format
  if (isVirtual && OFFICE_DOC_MIMES.has(mime)) {
    return { exportFormat: "html", extension: ".md", convert: "turndown", addFrontmatter: true };
  }
  if (isVirtual && OFFICE_SHEET_MIMES.has(mime)) {
    return { exportFormat: "csv", extension: ".csv", convert: "passthrough", addFrontmatter: false };
  }
  if (isVirtual && OFFICE_SLIDES_MIMES.has(mime)) {
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
    .replace(/[#^\[\]]/g, "")
    .replace(/^\./, "_")
    .trim();
  return s || "_";
}

/** Compute the vault-relative path for a synced Drive file. */
export function toVaultPath(file: DriveFile, vaultRoot: string): string {
  const mapping = getFormatMapping(file);
  const stripped = stripVirtualExt(file.Name);

  let baseName: string;
  if (mapping.exportFormat) {
    // Google Workspace file (native or Office MIME) — strip any extension, use target
    const dotIdx = stripped.lastIndexOf(".");
    const nameWithoutExt = dotIdx > 0 ? stripped.substring(0, dotIdx) : stripped;
    baseName = `${nameWithoutExt}${mapping.extension}`;
  } else if (stripped !== file.Name) {
    // Virtual extension was stripped but no export — use mapping extension
    baseName = `${stripped}${mapping.extension}`;
  } else {
    // Native file — keep original name
    baseName = stripped;
  }
  const fileName = sanitizeFilename(baseName);

  const dirParts = file.Path.split("/");
  dirParts.pop(); // remove filename
  const sanitizedDirs = dirParts.filter(p => p.length > 0).map(sanitizeFilename);
  const dir = sanitizedDirs.length > 0 ? sanitizedDirs.join("/") : "";

  const fullDir = dir ? `${vaultRoot}/${dir}` : vaultRoot;
  return `${fullDir}/${fileName}`;
}

/** Format a Date as "YYYY-MM-DD HH:mm" in local time. */
function formatSyncDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Map a Google Workspace MIME type to its web-app URL prefix. */
export function driveEditUrl(file: DriveFile): string | undefined {
  const mime = file.MimeType;
  if (mime === "application/vnd.google-apps.document" || OFFICE_DOC_MIMES.has(mime)) {
    return `https://docs.google.com/document/d/${file.ID}`;
  }
  if (mime === "application/vnd.google-apps.spreadsheet" || OFFICE_SHEET_MIMES.has(mime)) {
    return `https://docs.google.com/spreadsheets/d/${file.ID}`;
  }
  if (mime === "application/vnd.google-apps.presentation" || OFFICE_SLIDES_MIMES.has(mime)) {
    return `https://docs.google.com/presentation/d/${file.ID}`;
  }
  return undefined;
}

/** Build YAML frontmatter block for a synced .md file. */
export function buildFrontmatter(file: DriveFile, includeGdriveFields = true): string {
  const now = formatSyncDate(new Date());
  const lines = ["---"];
  if (includeGdriveFields) {
    lines.push(`gdrive_id: "${file.ID}"`);
    lines.push(`gdrive_path: "${file.Path}"`);
    const url = driveEditUrl(file);
    if (url) {
      lines.push(`google_document: "${url}"`);
    }
  }
  lines.push(`synced: "${now}"`);
  lines.push("---", "");
  return lines.join("\n");
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// Strip elements that Google Docs HTML includes but have no markdown equivalent.
// Without this, <style> CSS leaks into the converted markdown as raw text.
turndown.remove(["style", "script", "meta", "link"]);

// Google Docs HTML encodes list nesting via CSS classes on the parent <ol>/<ul>
// (e.g. lst-kix_abc123-2 = depth 2) rather than nested DOM elements.
// Override the default list item rule to read nesting depth from the parent class.
turndown.addRule("googleDocsListItem", {
  filter: "li",
  replacement(content: string, node: any, options: any): string {
    const parentClass = node.parentNode?.getAttribute?.("class") ?? "";
    const depthMatch = parentClass.match(/lst-kix_[a-z0-9]+-(\d+)/);
    const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
    const indent = "    ".repeat(depth);

    content = content
      .replace(/^\n+/, "")
      .replace(/\n+$/, "\n")
      .replace(/\n/gm, "\n" + indent + "    ");

    let prefix: string;
    const parent = node.parentNode;
    if (parent?.nodeName === "OL") {
      const start = parent.getAttribute?.("start");
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = (start ? Number(start) + index : index + 1) + ". ";
    } else {
      prefix = options.bulletListMarker + " ";
    }

    return indent + prefix + content + (node.nextSibling && !/\n$/.test(content) ? "\n" : "");
  },
});

/** Convert downloaded content to vault-ready content. */
export function convertContent(
  raw: string,
  mapping: FormatMapping,
  file: DriveFile,
  includeGdriveFields = true
): string {
  let content: string;

  if (mapping.convert === "turndown") {
    // Diagnostic: dump the first few list items' raw HTML to console
    const liSample = raw.match(/<li[^>]*>.*?<\/li>/gs)?.slice(0, 3) ?? [];
    const olSample = raw.match(/<ol[^>]*>/g)?.slice(0, 3) ?? [];
    const ulSample = raw.match(/<ul[^>]*>/g)?.slice(0, 3) ?? [];
    console.log(TAG, `List diagnostics: ${liSample.length > 0 ? "found <li>" : "no <li>"}`);
    for (const s of liSample) console.log(TAG, `  <li> sample: ${s.substring(0, 200)}`);
    for (const s of olSample) console.log(TAG, `  <ol> sample: ${s}`);
    for (const s of ulSample) console.log(TAG, `  <ul> sample: ${s}`);
    content = turndown.turndown(raw);
  } else {
    content = raw;
  }

  if (mapping.addFrontmatter) {
    content = buildFrontmatter(file, includeGdriveFields) + content;
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
  onLog: SyncLogFn = noop,
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
      const detail = `mime=${file.MimeType}, size=${file.Size}, export=${mapping.exportFormat ?? "native"}, convert=${mapping.convert}, ext=${mapping.extension}`;
      onLog("info", `${file.Name} — ${detail}`);
      console.log(TAG, `Sync: ${file.Path} (${detail})`);

      const raw = await drive.download(file.Path, mapping.exportFormat);
      console.log(TAG, `Raw content: length=${raw.length}, convert=${mapping.convert}, first200="${raw.substring(0, 200).replace(/\n/g, "\\n")}"`);

      let content: string;
      try {
        content = convertContent(raw, mapping, file, settings.frontmatterGdriveFields);
      } catch (convErr) {
        const msg = convErr instanceof Error ? convErr.message : String(convErr);
        console.error(TAG, `Conversion failed for ${file.Path}: ${msg}`);
        console.error(TAG, `Raw content that failed conversion (first 500 chars):`, raw.substring(0, 500));
        throw new Error(`Conversion failed (${mapping.convert}): ${msg}`);
      }
      console.log(TAG, `Converted content: length=${content.length}, first200="${content.substring(0, 200).replace(/\n/g, "\\n")}"`);

      const vaultPath = toVaultPath(file, settings.vaultRoot);

      await writeToVault(app, vaultPath, content);

      // Update sync state
      settings.syncState[file.Path] = {
        modTime: file.ModTime,
        vaultPath,
        fileId: file.ID,
        mimeType: file.MimeType,
      };
      await saveSettings();

      result.synced++;
      onLog("info", `✓ ${file.Name} → ${vaultPath}`);
      console.log(TAG, `Synced: ${file.Path} → ${vaultPath}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Log full file metadata on failure for debugging
      console.error(TAG, `Failed to sync ${file.Path}:`, msg);
      console.error(TAG, `File metadata:`, JSON.stringify(file, null, 2));
      onLog("error", `✗ ${file.Name}: ${msg}`);
      result.failed.push(file.Path);
    }
  }

  return result;
}

/** Write content to a vault path, creating parent folders as needed. */
async function writeToVault(app: App, path: string, content: string): Promise<void> {
  // Ensure parent folders exist (create from root down)
  const parts = path.split("/");
  parts.pop();
  if (parts.length > 0) {
    let current = "";
    for (const seg of parts) {
      current = current ? `${current}/${seg}` : seg;
      if (!app.vault.getAbstractFileByPath(current)) {
        await app.vault.createFolder(current);
      }
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
