import { execFile } from "child_process";
import { existsSync } from "fs";
import { DriveFile, ExportFormat } from "./types";

const MAX_BUFFER = 50 * 1024 * 1024; // 50 MB
const TAG = "[G Command]";

// Electron/Obsidian doesn't inherit the user's shell PATH, so Homebrew
// binaries aren't visible via bare name. Probe common install locations.
const RCLONE_SEARCH_PATHS = [
  "/opt/homebrew/bin/rclone",  // macOS ARM Homebrew
  "/usr/local/bin/rclone",     // macOS Intel Homebrew / manual install
  "/usr/bin/rclone",           // Linux package manager
  "rclone",                    // fallback: bare name (works if PATH is set)
];

export type DriveErrorCode = "binary-missing" | "remote-unreachable";

export class DriveError extends Error {
  constructor(
    public readonly code: DriveErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DriveError";
  }
}

/**
 * Wraps rclone subprocess calls for all Google Drive I/O.
 * All Drive access goes through this class — no credentials are held here;
 * auth is managed entirely by rclone via ~/.config/rclone/rclone.conf.
 */
export class DriveProvider {
  private rclonePath: string | null = null;
  private explicitPath: string | null = null;

  constructor(private remote: string) {}

  /** Update the remote name (e.g. after settings change). */
  setRemote(remote: string): void {
    this.remote = remote;
  }

  /**
   * Lists files and folders one level deep at the given Drive path.
   * Pass an empty string to list the Drive root.
   */
  async list(drivePath: string): Promise<DriveFile[]> {
    const remotePath = drivePath ? `${this.remote}:${drivePath}` : `${this.remote}:`;
    const output = await this.run(["lsjson", remotePath, "--max-depth", "1"]);
    return JSON.parse(output) as DriveFile[];
  }

  /**
   * Recursively lists all files (not folders) under the given Drive path.
   * Used by SyncManager to expand folder selections before syncing.
   */
  async listRecursive(drivePath: string): Promise<DriveFile[]> {
    const remotePath = drivePath ? `${this.remote}:${drivePath}` : `${this.remote}:`;
    const output = await this.run([
      "lsjson",
      remotePath,
      "--recursive",
      "--files-only",
    ]);
    return JSON.parse(output) as DriveFile[];
  }

  /**
   * Downloads a file and returns its content as a string.
   * For Google Workspace files, pass an exportFormat to trigger rclone's
   * Drive export (e.g. "html" for Docs, "csv" for Sheets).
   * For regular files, omit exportFormat.
   */
  async cat(drivePath: string, exportFormat?: ExportFormat): Promise<string> {
    // For Google Workspace files, rclone lists them with virtual extensions
    // (.gdoc, .gsheet, etc.) but cat needs the logical path without them.
    let catPath = drivePath;
    if (exportFormat) {
      catPath = drivePath.replace(/\.(gdoc|gsheet|gslides|gform)$/, "");
    }

    const remotePath = `${this.remote}:${catPath}`;
    const args = ["cat"];
    if (exportFormat) {
      args.push("--drive-export-formats", exportFormat);
    }
    args.push(remotePath);
    return this.run(args);
  }

  /**
   * Verifies that rclone is installed and the configured remote is reachable.
   * Throws a descriptive Error if either check fails.
   * Called once on plugin load and before each sync.
   */
  async check(): Promise<void> {
    await this.checkBinary();
    await this.checkRemote();
  }

  /** Set an explicit binary path override. Empty string = auto-detect. */
  setPath(path: string): void {
    this.explicitPath = path || null;
  }

  private async checkBinary(): Promise<void> {
    // Re-resolve on each check so installs mid-session are picked up
    this.rclonePath = null;

    // If user configured an explicit path, try only that
    if (this.explicitPath) {
      try {
        const version = await this.tryBinary(this.explicitPath);
        this.rclonePath = this.explicitPath;
        console.log(TAG, `rclone found at ${this.explicitPath} (configured):`, version);
        return;
      } catch {
        console.error(TAG, `Configured rclone path not usable: ${this.explicitPath}`);
        throw new DriveError(
          "binary-missing",
          `rclone not found at configured path: ${this.explicitPath}`
        );
      }
    }

    // Auto-detect from common install locations
    for (const candidate of RCLONE_SEARCH_PATHS) {
      // Bare name ("rclone") can't be stat'd — try execFile directly
      if (!candidate.includes("/") || existsSync(candidate)) {
        try {
          const version = await this.tryBinary(candidate);
          this.rclonePath = candidate;
          console.log(TAG, `rclone found at ${candidate}:`, version);
          return;
        } catch {
          console.log(TAG, `rclone not usable at ${candidate}`);
        }
      }
    }

    console.error(TAG, "rclone not found in any search path:", RCLONE_SEARCH_PATHS.join(", "));
    throw new DriveError(
      "binary-missing",
      "rclone is not installed (not found in PATH or common Homebrew locations)."
    );
  }

  private tryBinary(bin: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(bin, ["version"], { maxBuffer: MAX_BUFFER }, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout.split("\n")[0] ?? "unknown");
      });
    });
  }

  private async checkRemote(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(TAG, `Checking remote "${this.remote}"…`);
      execFile(
        this.rclonePath!,
        ["lsjson", `${this.remote}:`, "--max-depth", "1", "--files-only"],
        { maxBuffer: MAX_BUFFER },
        (err, _stdout, stderr) => {
          if (err) {
            const detail = stderr?.trim() || err.message;
            console.error(TAG, `Remote "${this.remote}" check failed:`, detail);
            reject(
              new DriveError(
                "remote-unreachable",
                `Remote "${this.remote}" is not reachable: ${detail}`
              )
            );
          } else {
            console.log(TAG, `Remote "${this.remote}" connected`);
            resolve();
          }
        }
      );
    });
  }

  private run(args: string[]): Promise<string> {
    if (!this.rclonePath) {
      return Promise.reject(new DriveError("binary-missing", "rclone path not resolved — call check() first."));
    }
    return new Promise((resolve, reject) => {
      execFile(this.rclonePath!, args, { maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
        if (err) {
          const detail = stderr?.trim() || err.message;
          console.error(TAG, `rclone ${args[0]} failed:`, detail);
          return reject(err);
        }
        resolve(stdout);
      });
    });
  }
}
