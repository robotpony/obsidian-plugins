import { App, TFile } from "obsidian";
import { DriveProvider } from "./DriveProvider";
import { DriveFile, GCommandSettings } from "./types";
import {
  getFormatMapping,
  convertContent,
  buildFrontmatter,
  stripVirtualExt,
  sanitizeFilename,
  toVaultPath,
  driveEditUrl,
} from "./convert";

const TAG = "[G Command]";

interface SyncResult {
  synced: number;
  skipped: number;
  failed: string[];
}

export type SyncLogFn = (level: "info" | "error", message: string) => void;

const noop: SyncLogFn = () => {};

// Re-export conversion functions so existing consumers don't break
export { getFormatMapping, stripVirtualExt, sanitizeFilename, toVaultPath, buildFrontmatter, convertContent, driveEditUrl };

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

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing && existing instanceof TFile) {
    await app.vault.modify(existing, content);
  } else {
    await app.vault.create(path, content);
  }
}
