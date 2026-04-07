import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { parseFrontmatter, listVaultFiles, readVaultFile, searchVault } from "./vault-provider";
import type { VaultInfo } from "./vault-discovery";

// ─── parseFrontmatter ──────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("parses key-value pairs from YAML frontmatter", () => {
    const content = '---\ntitle: "My Note"\ntags: [a, b, c]\n---\n# Hello';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({
      title: "My Note",
      tags: ["a", "b", "c"],
    });
    expect(body).toBe("# Hello");
  });

  it("returns null frontmatter when no --- delimiters", () => {
    const content = "# Just a heading\nSome text.";
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toBeNull();
    expect(body).toBe(content);
  });

  it("returns null when only opening delimiter exists", () => {
    const content = "---\ntitle: broken\nno closing delimiter";
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toBeNull();
    expect(body).toBe(content);
  });

  it("parses booleans", () => {
    const content = "---\npublished: true\ndraft: false\n---\nBody";
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter!.published).toBe(true);
    expect(frontmatter!.draft).toBe(false);
  });

  it("parses numbers", () => {
    const content = "---\ncount: 42\nrating: 3.5\n---\nBody";
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter!.count).toBe(42);
    expect(frontmatter!.rating).toBe(3.5);
  });

  it("handles unquoted string values", () => {
    const content = "---\nauthor: Bruce\n---\nBody";
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter!.author).toBe("Bruce");
  });

  it("handles empty frontmatter", () => {
    const content = "---\n---\nBody text";
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe("Body text");
  });

  it("parses quoted array elements", () => {
    const content = '---\ntags: ["project", "q2"]\n---\nBody';
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter!.tags).toEqual(["project", "q2"]);
  });
});

// ─── Integration tests with temp vault ──────────────────────────────────────

describe("vault file operations", () => {
  let tmpDir: string;
  let vault: VaultInfo;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vault-test-"));
    vault = { name: "test-vault", path: tmpDir, open: true };

    // Create vault structure
    await mkdir(join(tmpDir, "daily"), { recursive: true });
    await mkdir(join(tmpDir, "projects"), { recursive: true });
    await mkdir(join(tmpDir, ".obsidian"), { recursive: true }); // should be skipped

    await writeFile(join(tmpDir, "daily", "2026-04-06.md"), [
      "---",
      'title: "April 6"',
      "tags: [daily, log]",
      "---",
      "# Daily Log",
      "Did some work today.",
    ].join("\n"));

    await writeFile(join(tmpDir, "projects", "g-command.md"), [
      "---",
      'title: "G Command"',
      "status: active",
      "---",
      "# G Command",
      "Google Drive plugin for Obsidian.",
    ].join("\n"));

    await writeFile(join(tmpDir, "README.md"), "# Test Vault\nA test vault for unit tests.");

    // Hidden file that should be skipped
    await writeFile(join(tmpDir, ".obsidian", "app.json"), "{}");
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("listVaultFiles", () => {
    it("lists all non-hidden files", async () => {
      const files = await listVaultFiles(vault);
      const paths = files.map(f => f.path);
      expect(paths).toContain("daily/2026-04-06.md");
      expect(paths).toContain("projects/g-command.md");
      expect(paths).toContain("README.md");
      // Should not include .obsidian
      expect(paths.every(p => !p.startsWith(".obsidian"))).toBe(true);
    });

    it("returns modified timestamps", async () => {
      const files = await listVaultFiles(vault);
      for (const f of files) {
        expect(f.modified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });
  });

  describe("readVaultFile", () => {
    it("reads markdown with parsed frontmatter", async () => {
      const file = await readVaultFile(vault, "daily/2026-04-06.md");
      expect(file.vault).toBe("test-vault");
      expect(file.path).toBe("daily/2026-04-06.md");
      expect(file.frontmatter).toEqual({
        title: "April 6",
        tags: ["daily", "log"],
      });
      expect(file.content).toContain("# Daily Log");
      expect(file.content).not.toContain("---");
    });

    it("reads plain text without frontmatter", async () => {
      const file = await readVaultFile(vault, "README.md");
      expect(file.frontmatter).toBeNull();
      expect(file.content).toContain("# Test Vault");
    });
  });

  describe("searchVault", () => {
    it("finds files by filename match", async () => {
      const results = await searchVault(vault, "g-command");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe("projects/g-command.md");
    });

    it("finds files by content match", async () => {
      const results = await searchVault(vault, "Google Drive plugin");
      expect(results.length).toBeGreaterThan(0);
      const paths = results.map(r => r.path);
      expect(paths).toContain("projects/g-command.md");
    });

    it("returns scores and snippets", async () => {
      const results = await searchVault(vault, "g-command");
      expect(results[0].score).toBeGreaterThanOrEqual(0);
      expect(results[0].score).toBeLessThan(1);
      expect(results[0].snippet.length).toBeGreaterThan(0);
    });

    it("returns empty for no match", async () => {
      const results = await searchVault(vault, "xyznonexistent12345");
      expect(results).toHaveLength(0);
    });
  });
});
