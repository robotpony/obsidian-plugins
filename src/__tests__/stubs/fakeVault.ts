// Minimal in-memory Vault stand-in for testing ProjectSyncManager, which needs a
// vault that actually holds content (unlike Phase 1's spike, where sourceFile
// mutations bypass the vault entirely). Backed by a Map, not a real filesystem.
import { TFile } from "obsidian";

export class FakeTFile extends TFile {
  constructor(public path: string) {
    super();
  }
}

export class FakeVault {
  private files = new Map<string, string>();
  private folders = new Set<string>();

  getAbstractFileByPath(path: string): FakeTFile | Record<string, never> | null {
    if (this.files.has(path)) return new FakeTFile(path);
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
  }

  async create(path: string, content: string): Promise<FakeTFile> {
    this.files.set(path, content);
    return new FakeTFile(path);
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  // Test-only helpers, not part of the real Vault API.
  getRawContent(path: string): string | undefined {
    return this.files.get(path);
  }

  setRawContent(path: string, content: string): void {
    this.files.set(path, content);
  }
}

export function createFakeApp(): { app: { vault: FakeVault }; vault: FakeVault } {
  const vault = new FakeVault();
  return { app: { vault }, vault };
}
