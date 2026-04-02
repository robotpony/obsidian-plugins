// Mirrors the rclone lsjson output shape
export interface DriveFile {
  Path: string;
  Name: string;
  Size: number;
  MimeType: string;
  ModTime: string; // ISO 8601
  IsDir: boolean;
  ID: string;
}

// Persisted per-file sync record
export interface SyncRecord {
  modTime: string;   // Drive ModTime at last sync
  vaultPath: string; // Relative vault path where file was written
  fileId: string;    // Drive file ID
  mimeType?: string; // Drive MIME type (for correct export format on resync)
}

export interface GCommandSettings {
  rcloneRemote: string;
  rclonePath: string;                      // explicit binary path; empty = auto-detect
  vaultRoot: string;
  selectedPaths: string[];                 // Drive paths the user has checked
  syncState: Record<string, SyncRecord>;   // Drive path → last sync record
  frontmatterGdriveFields: boolean;        // include gdrive_id and gdrive_path in frontmatter
}

export const DEFAULT_SETTINGS: GCommandSettings = {
  rcloneRemote: "gdrive",
  rclonePath: "",
  vaultRoot: "gdrive",
  selectedPaths: [],
  syncState: {},
  frontmatterGdriveFields: true,
};

// Export format passed to rclone cat --drive-export-formats
export type ExportFormat = "html" | "csv" | "txt";
