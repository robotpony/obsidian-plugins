import { App, TFile, Events, debounce } from "obsidian";
import { TeamMember } from "./types";

const TEAM_LINE_REGEX = /^-\s+@([\w][\w.-]*)\s*(?:—|-)\s*(.+)$/;
const ME_SUFFIX = /\s*\(me\)\s*$/i;

export class TeamManager extends Events {
  private app: App;
  private filePath: string;
  private members: TeamMember[] = [];
  private pendingAdds: Set<string> = new Set();

  private debouncedFlushAdds = debounce(() => this.flushPendingAdds(), 500, true);

  constructor(app: App, filePath: string) {
    super();
    this.app = app;
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    await this.parse();
  }

  setFilePath(filePath: string): void {
    this.filePath = filePath;
    this.parse();
  }

  getTeam(): TeamMember[] {
    return this.members;
  }

  resolveMe(): string | null {
    const me = this.members.find(m => m.isMe);
    return me?.handle ?? null;
  }

  resolveHandle(raw: string): TeamMember | null {
    if (raw === "me") {
      const meHandle = this.resolveMe();
      if (!meHandle) return null;
      return this.members.find(m => m.handle === meHandle) ?? null;
    }
    return this.members.find(m => m.handle === raw) ?? null;
  }

  isKnownHandle(handle: string): boolean {
    if (handle === "me") return true;
    return this.members.some(m => m.handle === handle);
  }

  addMember(handle: string): void {
    if (this.isKnownHandle(handle)) return;
    this.pendingAdds.add(handle);
    this.debouncedFlushAdds();
  }

  private async flushPendingAdds(): Promise<void> {
    if (this.pendingAdds.size === 0) return;

    const handles = [...this.pendingAdds];
    this.pendingAdds.clear();

    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);
    const newLines = handles
      .filter(h => !this.members.some(m => m.handle === h))
      .map(h => `- @${h} — ${h}`);

    if (newLines.length === 0) return;

    const updated = content.trimEnd() + "\n" + newLines.join("\n") + "\n";
    await this.app.vault.modify(file, updated);
  }

  async createTeamFile(): Promise<TFile> {
    let username = "me";
    try {
      username = require("os").userInfo().username || "me";
    } catch { /* fallback */ }

    const content = `# Team\n\n- @${username} — ${username} (me)\n`;
    const file = await this.app.vault.create(this.filePath, content);
    await this.parse();
    return file;
  }

  watchFile(): void {
    this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.path === this.filePath) {
        this.parse();
      }
    });
    this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.path === this.filePath) {
        this.parse();
      }
    });
    this.app.vault.on("delete", (file) => {
      if (file instanceof TFile && file.path === this.filePath) {
        this.members = [];
        this.trigger("team-updated");
      }
    });
  }

  private async parse(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) {
      this.members = [];
      this.trigger("team-updated");
      return;
    }

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const members: TeamMember[] = [];

    for (const line of lines) {
      const match = line.match(TEAM_LINE_REGEX);
      if (!match) continue;

      const handle = match[1];
      let name = match[2].trim();
      const isMe = ME_SUFFIX.test(name);
      if (isMe) {
        name = name.replace(ME_SUFFIX, "").trim();
      }

      members.push({ handle, name, isMe });
    }

    this.members = members;
    this.trigger("team-updated");
  }
}
