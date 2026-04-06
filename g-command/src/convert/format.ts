import { ConvertFile, FormatMapping } from "./types";

// Office MIME types that rclone uses when exporting Google Workspace files.
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
export function getFormatMapping(file: ConvertFile): FormatMapping {
  const mime = file.MimeType;
  const isVirtual = file.Size === -1;

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
export function toVaultPath(file: ConvertFile, vaultRoot: string): string {
  const mapping = getFormatMapping(file);
  const stripped = stripVirtualExt(file.Name);

  let baseName: string;
  if (mapping.exportFormat) {
    const dotIdx = stripped.lastIndexOf(".");
    const nameWithoutExt = dotIdx > 0 ? stripped.substring(0, dotIdx) : stripped;
    baseName = `${nameWithoutExt}${mapping.extension}`;
  } else if (stripped !== file.Name) {
    baseName = `${stripped}${mapping.extension}`;
  } else {
    baseName = stripped;
  }
  const fileName = sanitizeFilename(baseName);

  const dirParts = file.Path.split("/");
  dirParts.pop();
  const sanitizedDirs = dirParts.filter(p => p.length > 0).map(sanitizeFilename);
  const dir = sanitizedDirs.length > 0 ? sanitizedDirs.join("/") : "";

  const fullDir = dir ? `${vaultRoot}/${dir}` : vaultRoot;
  return `${fullDir}/${fileName}`;
}

/** Map a Google Workspace MIME type to its web-app URL prefix. */
export function driveEditUrl(file: ConvertFile): string | undefined {
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
