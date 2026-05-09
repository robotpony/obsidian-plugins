import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { readVaultRoot, updateSyncState } from "./pull-helpers";
import type { ConvertFile } from "../convert/types";

let testDir: string;

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "pull-test-"));
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ─── readVaultRoot ─────────────────────────────────────────────────────────

describe("readVaultRoot", () => {
  it("reads vaultRoot from data.json", async () => {
    const vaultPath = join(testDir, "vault-with-root");
    const pluginDir = join(vaultPath, ".obsidian", "plugins", "g-command");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, "data.json"),
      JSON.stringify({ vaultRoot: "synced-docs", syncState: {} }),
    );

    expect(readVaultRoot(vaultPath)).toBe("synced-docs");
  });

  it("returns 'gdrive' when data.json is missing", () => {
    const vaultPath = join(testDir, "no-data-json");
    expect(readVaultRoot(vaultPath)).toBe("gdrive");
  });

  it("returns 'gdrive' when vaultRoot key is absent", async () => {
    const vaultPath = join(testDir, "vault-no-key");
    const pluginDir = join(vaultPath, ".obsidian", "plugins", "g-command");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "data.json"), JSON.stringify({ syncState: {} }));

    expect(readVaultRoot(vaultPath)).toBe("gdrive");
  });
});

// ─── updateSyncState ───────────────────────────────────────────────────────

describe("updateSyncState", () => {
  const file: ConvertFile = {
    Path: "Projects/Brief.gdoc",
    Name: "Brief.gdoc",
    Size: -1,
    MimeType: "application/vnd.google-apps.document",
    ModTime: "2026-04-01T12:00:00Z",
    IsDir: false,
    ID: "abc123",
  };

  it("creates data.json and syncState from scratch", async () => {
    const vaultPath = join(testDir, "vault-fresh");
    updateSyncState(vaultPath, file, "gdrive/Projects/Brief.md");

    const dataPath = join(vaultPath, ".obsidian", "plugins", "g-command", "data.json");
    const data = JSON.parse(await readFile(dataPath, "utf-8"));

    expect(data.syncState).toBeDefined();
    const entry = data.syncState["gdrive/Projects/Brief.md"];
    expect(entry).toBeDefined();
    expect(entry.driveId).toBe("abc123");
    expect(entry.drivePath).toBe("Projects/Brief.gdoc");
    expect(entry.mimeType).toBe("application/vnd.google-apps.document");
    expect(entry.lastSync).toBeDefined();
  });

  it("merges into existing data.json without clobbering other keys", async () => {
    const vaultPath = join(testDir, "vault-existing");
    const pluginDir = join(vaultPath, ".obsidian", "plugins", "g-command");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, "data.json"),
      JSON.stringify({
        vaultRoot: "synced-docs",
        someOtherKey: true,
        syncState: { "synced-docs/Old.md": { driveId: "old" } },
      }),
    );

    updateSyncState(vaultPath, file, "synced-docs/Projects/Brief.md");

    const data = JSON.parse(await readFile(join(pluginDir, "data.json"), "utf-8"));
    expect(data.vaultRoot).toBe("synced-docs");
    expect(data.someOtherKey).toBe(true);
    expect(data.syncState["synced-docs/Old.md"]).toEqual({ driveId: "old" });
    expect(data.syncState["synced-docs/Projects/Brief.md"].driveId).toBe("abc123");
  });

  it("overwrites existing syncState entry for the same path", async () => {
    const vaultPath = join(testDir, "vault-overwrite");
    const pluginDir = join(vaultPath, ".obsidian", "plugins", "g-command");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, "data.json"),
      JSON.stringify({
        syncState: { "gdrive/Brief.md": { driveId: "old-id", lastSync: "old" } },
      }),
    );

    updateSyncState(vaultPath, file, "gdrive/Brief.md");

    const data = JSON.parse(await readFile(join(pluginDir, "data.json"), "utf-8"));
    expect(data.syncState["gdrive/Brief.md"].driveId).toBe("abc123");
    expect(data.syncState["gdrive/Brief.md"].lastSync).not.toBe("old");
  });
});
