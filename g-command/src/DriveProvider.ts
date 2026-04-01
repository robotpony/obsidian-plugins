import { execFile } from "child_process";
import { DriveFile, ExportFormat } from "./types";

const MAX_BUFFER = 50 * 1024 * 1024; // 50 MB

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
  constructor(private remote: string) {}

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
    const remotePath = `${this.remote}:${drivePath}`;
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

  private async checkBinary(): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile("rclone", ["version"], { maxBuffer: MAX_BUFFER }, (err) => {
        if (err) {
          reject(
            new DriveError(
              "binary-missing",
              "rclone is not installed."
            )
          );
        } else {
          resolve();
        }
      });
    });
  }

  private async checkRemote(): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(
        "rclone",
        ["lsjson", `${this.remote}:`, "--max-depth", "1", "--files-only"],
        { maxBuffer: MAX_BUFFER },
        (err) => {
          if (err) {
            reject(
              new DriveError(
                "remote-unreachable",
                `Remote "${this.remote}" is not reachable.`
              )
            );
          } else {
            resolve();
          }
        }
      );
    });
  }

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("rclone", args, { maxBuffer: MAX_BUFFER }, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      });
    });
  }
}
