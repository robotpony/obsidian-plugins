import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    mkdtempSync: vi.fn(() => "/tmp/gc-test123"),
    readdirSync: vi.fn(() => ["exported.html"]),
    readFileSync: vi.fn(() => "<h1>Hello</h1>"),
    rmSync: vi.fn(),
  };
});

import { execFile } from "child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { DriveProvider } from "./DriveProvider";
import type { DriveFile } from "./types";

const mockMkdtempSync = vi.mocked(mkdtempSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockRmSync = vi.mocked(rmSync);

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

  beforeEach(async () => {
    vi.clearAllMocks();
    provider = new DriveProvider("gdrive");
    // Set explicit path so run() doesn't reject with "path not resolved".
    // checkBinary() with explicitPath only needs one execFile mock.
    provider.setPath("/usr/bin/rclone");
    mockExecFile
      .mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "rclone v1.73.3", ""); // checkBinary → tryBinary
        return {} as any;
      })
      .mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "[]", ""); // checkRemote
        return {} as any;
      });
    await provider.check();
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

  // --- download() ---

  describe("download()", () => {
    it("uses rclone copy with --include from parent directory", async () => {
      mockSuccess("");
      await provider.download("Folder/Brief.docx", "html");
      const args = lastArgs();
      expect(args[0]).toBe("copy");
      expect(args).toContain("--include");
      expect(args).toContain("gdrive:Folder");
    });

    it("swaps extension in --include filter to match export format", async () => {
      mockSuccess("");
      await provider.download("Folder/Brief.docx", "html");
      const args = lastArgs();
      const includeIdx = args.indexOf("--include");
      expect(args[includeIdx + 1]).toBe("Brief.html");
    });

    it("uses original filename in --include when no export format", async () => {
      mockSuccess("");
      await provider.download("Folder/notes.txt");
      const args = lastArgs();
      const includeIdx = args.indexOf("--include");
      expect(args[includeIdx + 1]).toBe("notes.txt");
    });

    it("adds --drive-export-formats when exportFormat is provided", async () => {
      mockSuccess("");
      await provider.download("Work/Brief.gdoc", "html");
      const args = lastArgs();
      expect(args).toContain("--drive-export-formats");
      expect(args).toContain("html");
    });

    it("omits --drive-export-formats when no exportFormat", async () => {
      mockSuccess("");
      await provider.download("Readme.txt");
      const args = lastArgs();
      expect(args).not.toContain("--drive-export-formats");
    });

    it("uses remote root for files without parent directory", async () => {
      mockSuccess("");
      await provider.download("Brief.docx", "html");
      const args = lastArgs();
      expect(args).toContain("gdrive:");
    });

    it("reads the first file from the temp directory", async () => {
      mockSuccess("");
      const result = await provider.download("Doc.gdoc", "html");
      expect(result).toBe("<h1>Hello</h1>");
      expect(mockReadFileSync).toHaveBeenCalledWith("/tmp/gc-test123/exported.html", "utf-8");
    });

    it("cleans up temp directory after success", async () => {
      mockSuccess("");
      await provider.download("Doc.gdoc", "html");
      expect(mockRmSync).toHaveBeenCalledWith("/tmp/gc-test123", { recursive: true, force: true });
    });

    it("cleans up temp directory after failure", async () => {
      mockFailure("connection error");
      await expect(provider.download("Doc.gdoc", "html")).rejects.toThrow();
      expect(mockRmSync).toHaveBeenCalledWith("/tmp/gc-test123", { recursive: true, force: true });
    });

    it("throws when rclone copy produces no output files", async () => {
      mockSuccess("");
      (readdirSync as any).mockReturnValueOnce([]);
      await expect(provider.download("empty.gdoc", "html")).rejects.toThrow("no output");
    });

    it("supports csv export format for Sheets", async () => {
      mockSuccess("");
      await provider.download("Budget.gsheet", "csv");
      expect(lastArgs()).toContain("csv");
    });

    it("rejects on rclone error", async () => {
      mockFailure("file not found");
      await expect(provider.download("missing.gdoc", "html")).rejects.toThrow("file not found");
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

    it("throws a DriveError with code binary-missing when rclone is absent", async () => {
      const freshProvider = new DriveProvider("gdrive");
      freshProvider.setPath("/nonexistent/rclone");
      mockFailure("rclone: command not found");
      await expect(freshProvider.check()).rejects.toMatchObject({
        name: "DriveError",
        code: "binary-missing",
      });
    });

    it("throws a DriveError with code remote-unreachable when remote fails", async () => {
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

      await expect(provider.check()).rejects.toMatchObject({
        name: "DriveError",
        code: "remote-unreachable",
      });
    });

    it("uses the configured remote name in the check call", async () => {
      const customProvider = new DriveProvider("my-drive");
      customProvider.setPath("/usr/bin/rclone");
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
