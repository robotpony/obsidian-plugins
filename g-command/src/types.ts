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
  driveCache: DriveTreeCache | null;       // cached tree for instant sidebar render
}

export const DEFAULT_SETTINGS: GCommandSettings = {
  rcloneRemote: "gdrive",
  rclonePath: "",
  vaultRoot: "gdrive",
  selectedPaths: [],
  syncState: {},
  frontmatterGdriveFields: true,
  driveCache: null,
};

// Cached Drive tree for instant sidebar rendering
export interface DriveTreeCache {
  /** ISO timestamp of last successful refresh */
  lastRefresh: string;
  /** Cached folder listings, keyed by Drive path ("" = root) */
  folders: Record<string, DriveFile[]>;
}

// Export format passed to rclone cat --drive-export-formats
export type ExportFormat = "html" | "csv" | "txt";
