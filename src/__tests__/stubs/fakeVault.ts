// Minimal in-memory Vault stand-in for testing ProjectSyncManager, which needs a
// vault that actually holds content (unlike Phase 1's spike, where sourceFile
// mutations bypass the vault entirely). Backed by a Map, not a real filesystem.
import { TFile } from "obsidian";

export class FakeTFile extends TFile {
  stat: { mtime: number; ctime: number; size: number };

  constructor(public path: string, mtime: number = Date.now()) {
    super();
    this.stat = { mtime, ctime: mtime, size: 0 };
  }
}

export class FakeVault {
  private files = new Map<string, string>();
  private folders = new Set<string>();
  private mtimes = new Map<string, number>();

  getAbstractFileByPath(path: string): FakeTFile | Record<string, never> | null {
    if (this.files.has(path)) return new FakeTFile(path, this.mtimes.get(path));
    if (this.folders.has(path)) return {}; // folder marker — not a TFile, just non-null
    return null;
  }

  async read(file: FakeTFile): Promise<string> {
    const content = this.files.get(file.path);
    if (content === undefined) throw new Error(`FakeVault: file not found: ${file.path}`);
    return content;
  }

  async modify(file: FakeTFile, content: string): Promise<void> {
    if (!this.files.has(file.path)) throw new Error(`FakeVault: file not found: ${file.path}`);
    this.files.set(file.path, content);
    this.mtimes.set(file.path, Date.now());
  }

  async create(path: string, content: string): Promise<FakeTFile> {
    this.files.set(path, content);
    this.mtimes.set(path, Date.now());
    return new FakeTFile(path, this.mtimes.get(path));
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  // Test-only helpers, not part of the real Vault API.
  getRawContent(path: string): string | undefined {
    return this.files.get(path);
  }

  /** `mtime` lets a test pin down a specific timestamp; omitted, it keeps whatever this path already had, or defaults to now for a brand-new path. */
  setRawContent(path: string, content: string, mtime?: number): void {
    this.files.set(path, content);
    this.mtimes.set(path, mtime ?? this.mtimes.get(path) ?? Date.now());
  }
}

export function createFakeApp(): { app: { vault: FakeVault }; vault: FakeVault } {
  const vault = new FakeVault();
  return { app: { vault }, vault };
}
