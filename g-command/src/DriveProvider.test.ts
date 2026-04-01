import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "child_process";
import { DriveProvider } from "./DriveProvider";
import type { DriveFile } from "./types";

const mockExecFile = vi.mocked(execFile);

// Helper: mock a successful rclone call returning stdout
function mockSuccess(stdout: string) {
  mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    cb(null, stdout, "");
    return {} as any;
  });
}

// Helper: mock a failing rclone call
function mockFailure(message: string) {
  mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    cb(new Error(message), "", message);
    return {} as any;
  });
}

// Capture the args passed to the most recent execFile call
function lastArgs(): string[] {
  const calls = mockExecFile.mock.calls;
  return calls[calls.length - 1][1] as string[];
}

const sampleFile: DriveFile = {
  Path: "Work/Brief.gdoc",
  Name: "Brief.gdoc",
  Size: -1,
  MimeType: "application/vnd.google-apps.document",
  ModTime: "2026-01-15T10:00:00.000Z",
  IsDir: false,
  ID: "abc123",
};

const sampleFolder: DriveFile = {
  Path: "Work",
  Name: "Work",
  Size: -1,
  MimeType: "inode/directory",
  ModTime: "2026-01-01T00:00:00.000Z",
  IsDir: true,
  ID: "dir456",
};

describe("DriveProvider", () => {
  let provider: DriveProvider;

  beforeEach(() => {
    provider = new DriveProvider("gdrive");
    vi.clearAllMocks();
  });

  // --- list() ---

  describe("list()", () => {
    it("uses remote root when drivePath is empty", async () => {
      mockSuccess(JSON.stringify([sampleFile]));
      await provider.list("");
      expect(lastArgs()).toContain("gdrive:");
    });

    it("appends drivePath to remote when provided", async () => {
      mockSuccess(JSON.stringify([sampleFile]));
      await provider.list("Work");
      expect(lastArgs()).toContain("gdrive:Work");
    });

    it("passes --max-depth 1", async () => {
      mockSuccess("[]");
      await provider.list("");
      const args = lastArgs();
      expect(args).toContain("--max-depth");
      expect(args).toContain("1");
    });

    it("parses and returns DriveFile array", async () => {
      mockSuccess(JSON.stringify([sampleFile, sampleFolder]));
      const result = await provider.list("");
      expect(result).toHaveLength(2);
      expect(result[0].Path).toBe("Work/Brief.gdoc");
      expect(result[1].IsDir).toBe(true);
    });

    it("returns empty array for empty Drive folder", async () => {
      mockSuccess("[]");
      const result = await provider.list("Archive");
      expect(result).toEqual([]);
    });

    it("rejects on rclone error", async () => {
      mockFailure("connection refused");
      await expect(provider.list("")).rejects.toThrow("connection refused");
    });
  });

  // --- listRecursive() ---

  describe("listRecursive()", () => {
    it("passes --recursive and --files-only flags", async () => {
      mockSuccess("[]");
      await provider.listRecursive("Work");
      const args = lastArgs();
      expect(args).toContain("--recursive");
      expect(args).toContain("--files-only");
    });

    it("uses remote root when drivePath is empty", async () => {
      mockSuccess("[]");
      await provider.listRecursive("");
      expect(lastArgs()).toContain("gdrive:");
    });

    it("parses files from nested paths", async () => {
      const nested = { ...sampleFile, Path: "Work/Projects/Brief.gdoc" };
      mockSuccess(JSON.stringify([nested]));
      const result = await provider.listRecursive("Work");
      expect(result[0].Path).toBe("Work/Projects/Brief.gdoc");
    });
  });

  // --- cat() ---

  describe("cat()", () => {
    it("calls rclone cat with the remote path", async () => {
      mockSuccess("<html>content</html>");
      await provider.cat("Work/Brief.gdoc");
      const args = lastArgs();
      expect(args[0]).toBe("cat");
      expect(args).toContain("gdrive:Work/Brief.gdoc");
    });

    it("adds --drive-export-formats when exportFormat is provided", async () => {
      mockSuccess("<html>content</html>");
      await provider.cat("Work/Brief.gdoc", "html");
      const args = lastArgs();
      expect(args).toContain("--drive-export-formats");
      expect(args).toContain("html");
    });

    it("omits --drive-export-formats when no exportFormat", async () => {
      mockSuccess("plain text");
      await provider.cat("Readme.txt");
      const args = lastArgs();
      expect(args).not.toContain("--drive-export-formats");
    });

    it("supports csv export format for Sheets", async () => {
      mockSuccess("a,b,c\n1,2,3");
      await provider.cat("Budget.gsheet", "csv");
      expect(lastArgs()).toContain("csv");
    });

    it("returns stdout as string", async () => {
      mockSuccess("<h1>Hello</h1>");
      const result = await provider.cat("Doc.gdoc", "html");
      expect(result).toBe("<h1>Hello</h1>");
    });

    it("rejects on rclone error", async () => {
      mockFailure("file not found");
      await expect(provider.cat("missing.gdoc", "html")).rejects.toThrow("file not found");
    });
  });

  // --- check() ---

  describe("check()", () => {
    it("resolves when rclone is installed and remote is reachable", async () => {
      // First call: rclone version. Second call: lsjson remote.
      mockExecFile
        .mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "rclone v1.73.3", "");
          return {} as any;
        })
        .mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "[]", "");
          return {} as any;
        });

      await expect(provider.check()).resolves.toBeUndefined();
    });

    it("throws a helpful message when rclone binary is missing", async () => {
      mockFailure("rclone: command not found");
      await expect(provider.check()).rejects.toThrow(/brew install rclone/);
    });

    it("throws a helpful message when remote is not configured", async () => {
      // First call (version) succeeds, second call (lsjson) fails
      mockExecFile
        .mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "rclone v1.73.3", "");
          return {} as any;
        })
        .mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(new Error("didn't find section in config file"), "", "");
          return {} as any;
        });

      await expect(provider.check()).rejects.toThrow(/rclone config/);
    });

    it("uses the configured remote name in the check call", async () => {
      const customProvider = new DriveProvider("my-drive");
      mockExecFile
        .mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "rclone v1.73.3", "");
          return {} as any;
        })
        .mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
          cb(null, "[]", "");
          return {} as any;
        });

      await customProvider.check();
      const calls = mockExecFile.mock.calls;
      const remoteArg = calls[1][1] as string[];
      expect(remoteArg).toContain("my-drive:");
    });
  });
});
