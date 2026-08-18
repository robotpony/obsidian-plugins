import { App, TFile } from "obsidian";
import { existsSync, watch, FSWatcher } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { ProjectScanner, ScannedProject } from "./ProjectScanner";
import { parseStructuredFile, ParsedProjectItem } from "./StructuredFileParser";
import { projectFilePath } from "./ProjectManager";

const TAG = "[Warped Todo]";
const STRUCTURED_FILENAMES = ["BUGS.md", "TODO.md", "TODOS.md", "IDEAS.md", "ISSUES.md"];
const WATCH_DEBOUNCE_MS = 300;
// Ignore watch events for this long right after a sync completes — a plain
// `git status` (run per repo during every scan) can rewrite `.git/index`'s
// mtime with no real change, which the watcher then picks up and re-triggers
// on. Without this, that's a tight, potentially self-sustaining resync loop.
const WATCH_COOLDOWN_MS = 1500;

// Sync owns exactly these frontmatter keys. Anything else already in the
// file's frontmatter is preserved as-is — see mergeFrontmatter(). `cssclasses`
// is Obsidian's standard per-note styling hook — styles.css hides the
// Properties panel for notes carrying it, since the sidebar already surfaces
// those fields (see DESIGN.md's Projects Extension).
const PROJECT_NOTE_CSS_CLASS = "warped-todo-project-note";
const SYNC_KEY_ORDER = ["project", "title", "stack", "repo", "remote", "branch", "gitStatus", "lastSynced"] as const;
const SYNC_KEYS = new Set<string>(SYNC_KEY_ORDER);

export interface SyncOptions {
  baseFolder: string;
  projectsFolder: string;
  maxDepth?: number;
  excludeDirs?: string[];
}

/**
 * Keeps each repo-matched project's vault note's frontmatter (git facts) in
 * sync with disk. Does **not** write items into the note body — the Projects
 * sidebar is the only place synced #todo/#idea/#bug items are shown (see
 * PLAN.md's "in-doc listing removed" writeup for why: writing a rendered
 * `#todo`/`#todone` block into the vault put this system at odds with
 * TodoScanner's own vault-wide checkbox<->tag correction, which produced a
 * genuine content-flicker loop, plus every sync writing the note — however
 * lightly — was disruptive to a note open for editing). Everything else in
 * the note (e.g. a hand-written `## Overview`) is left untouched.
 */
export class ProjectSyncManager {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Set at the end of every syncAll() (manual or watch-triggered) — see
  // WATCH_COOLDOWN_MS above for why watch events are ignored for a bit after.
  private lastSyncCompletedAt = 0;
  // Items from the most recent syncAll() pass, keyed by localPath — this is
  // the actual data source for the Projects sidebar's synced-item display
  // (list-view counts and the detail view), not the vault note.
  private lastItemsByPath = new Map<string, ParsedProjectItem[]>();

  constructor(
    private app: App,
    private scanner: ProjectScanner = new ProjectScanner(),
    // Passes the fresh scan results directly — callers must NOT respond by
    // triggering another syncAll() (e.g. via a view's own full-reload method),
    // or this becomes infinite recursion: syncAll -> onSynced -> reload ->
    // syncAll -> ... Found via live testing, spinning as fast as a full
    // scan+sync pass could complete (every ~200ms against a real base folder).
    // Callers should only re-render using the passed data.
    private onSynced?: (scanned: ScannedProject[]) => void
  ) {}

  /** Discovers projects under `baseFolder`, reads their structured files, and syncs each note's frontmatter. */
  async syncAll(options: SyncOptions): Promise<ScannedProject[]> {
    const scanned = await this.scanner.scan({
      baseFolder: options.baseFolder,
      maxDepth: options.maxDepth,
      excludeDirs: options.excludeDirs,
    });
    const projects = dedupeByName(scanned);

    for (const project of projects) {
      const items = await readProjectItems(project.localPath);
      await this.syncProject(project, items, options.projectsFolder);
    }

    this.lastSyncCompletedAt = Date.now();
    this.onSynced?.(projects);
    return projects;
  }

  /** Cached items from the most recent syncAll() (or updateCachedItems) — see the class-level comment on lastItemsByPath. */
  getCachedItems(localPath: string): ParsedProjectItem[] {
    return this.lastItemsByPath.get(localPath) ?? [];
  }

  /**
   * Updates the cache without any vault I/O — for a caller (the sidebar's
   * detail view) that just mutated a synced item's source file and wants the
   * next render to reflect it immediately, without the cost (and vault write)
   * of a full syncProject() just to refresh an in-memory cache.
   */
  updateCachedItems(localPath: string, items: ParsedProjectItem[]): void {
    this.lastItemsByPath.set(localPath, items);
  }

  /** Syncs one project's note: create it (frontmatter only) if missing, otherwise merge frontmatter. Body is never touched. */
  async syncProject(
    scanned: ScannedProject,
    items: ParsedProjectItem[],
    projectsFolder: string
  ): Promise<void> {
    // Cache updates here (not just in syncAll's loop) so a caller resyncing a
    // single project after a mutation sees fresh getCachedItems() results
    // immediately, not just after the next full syncAll pass.
    this.lastItemsByPath.set(scanned.localPath, items);

    const filePath = projectFilePath(projectsFolder, scanned.name);
    const now = new Date().toISOString();

    const existing = this.app.vault.getAbstractFileByPath(filePath);

    if (!(existing instanceof TFile)) {
      await this.ensureFolderExists(filePath);
      const frontmatter = serializeFrontmatter(mergeFrontmatter(new Map(), scanned, now));
      // No leading `# name` heading — Obsidian's own file-title display
      // already shows the note's name at the top; a duplicate heading in the
      // body just repeated it a second time (a third, alongside the sidebar's
      // own title, before that was also fixed — found via live testing).
      const body = `\n#${scanned.name}\n\n## Overview\n\n`;
      await this.app.vault.create(filePath, frontmatter + body);
      return;
    }

    const content = await this.app.vault.read(existing);
    const { entries, body } = parseFrontmatter(content);
    const mergedEntries = mergeFrontmatter(entries, scanned, now);

    // Bumping lastSynced on every pass made every sync a write, whether or not
    // anything real changed — which floods Obsidian's own "modified externally"
    // notice on a note that happens to be open (each vault.modify() on an open
    // file triggers it, by Obsidian's own design). Compare against a version
    // stamped with the *previous* lastSynced first; if that's the only
    // difference, there's nothing real to sync, so skip the write and leave
    // lastSynced stale until a sync actually finds something to change.
    const previousLastSynced = entries.get("lastSynced");
    if (previousLastSynced !== undefined) {
      const unchanged = new Map(mergedEntries);
      unchanged.set("lastSynced", previousLastSynced);
      if (serializeFrontmatter(unchanged) + body === content) return;
    }

    const updated = serializeFrontmatter(mergedEntries) + body;
    if (updated !== content) {
      await this.app.vault.modify(existing, updated);
    }
  }

  /**
   * Watches the base folder recursively for changes (new/removed repos, edited
   * structured files) and re-syncs on a debounce. Recursive `fs.watch` is only
   * reliable on macOS/Windows, not Linux — acceptable given the macOS-only scope
   * decision in OUTLINE.md/IDEAS.md. Events under an excluded directory (same
   * list `ProjectScanner` skips while walking) are ignored here too — the walk
   * skipping them doesn't stop the raw watch from seeing activity inside, e.g.
   * a large `node_modules` tree churning on every `npm install`.
   */
  startWatching(options: SyncOptions): void {
    this.stopWatching();
    if (!options.baseFolder || !existsSync(options.baseFolder)) return;

    const excludeDirs = new Set(options.excludeDirs ?? []);
    try {
      this.watcher = watch(options.baseFolder, { recursive: true }, (_event, filename) => {
        if (filename && isUnderExcludedDir(filename, excludeDirs)) return;
        this.scheduleSyncAll(options);
      });
    } catch (error) {
      console.error(TAG, "Failed to watch base folder for Projects sync:", error);
    }
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private scheduleSyncAll(options: SyncOptions): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      // Within the cooldown of our own last sync, a fresh event is more likely
      // a side effect of that sync (e.g. `git status` touching `.git/index`)
      // than a real external change — see WATCH_COOLDOWN_MS above.
      if (Date.now() - this.lastSyncCompletedAt < WATCH_COOLDOWN_MS) return;
      this.syncAll(options).catch((error) =>
        console.error(TAG, "Watch-triggered project sync failed:", error)
      );
    }, WATCH_DEBOUNCE_MS);
  }

  /**
   * Fresh `ParsedProjectItem[]` for one project's structured files, for callers
   * (the Projects sidebar's detail view) that need synced items on demand
   * without waiting for or triggering a full `syncAll()` pass.
   */
  async getProjectItems(localPath: string): Promise<ParsedProjectItem[]> {
    return readProjectItems(localPath);
  }

  private async ensureFolderExists(filePath: string): Promise<void> {
    const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
    if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
      await this.app.vault.createFolder(folderPath);
    }
  }
}

/**
 * Two repos with the same folder name (an archived or deployed copy alongside
 * the original — real and common; found via the dry run against ~/projects,
 * see PLAN.md's Phase 5 notes) would otherwise silently overwrite each other's
 * synced note, since the note path is keyed on name alone. Keeps the shallowest
 * path per name (a top-level checkout is more likely the canonical one than
 * something nested under archive/ or a deploy folder) and logs the rest.
 */
function dedupeByName(projects: ScannedProject[]): ScannedProject[] {
  const byName = new Map<string, ScannedProject[]>();
  for (const project of projects) {
    const group = byName.get(project.name) ?? [];
    group.push(project);
    byName.set(project.name, group);
  }

  const result: ScannedProject[] = [];
  for (const [name, group] of byName) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((a, b) => {
      const depthDiff = a.localPath.split("/").length - b.localPath.split("/").length;
      return depthDiff !== 0 ? depthDiff : a.localPath.length - b.localPath.length;
    });
    result.push(sorted[0]);
    console.warn(
      TAG,
      `Multiple repos named "${name}" found — syncing ${sorted[0].localPath}, skipping: ${sorted
        .slice(1)
        .map((p) => p.localPath)
        .join(", ")}`
    );
  }
  return result;
}

/** True if any path segment of `filename` (relative, as fs.watch reports it) matches an excluded directory name. */
export function isUnderExcludedDir(filename: string, excludeDirs: Set<string>): boolean {
  return filename.split(/[\\/]/).some((segment) => excludeDirs.has(segment));
}

async function readProjectItems(localPath: string): Promise<ParsedProjectItem[]> {
  const items: ParsedProjectItem[] = [];
  for (const filename of STRUCTURED_FILENAMES) {
    const filePath = join(localPath, filename);
    if (!existsSync(filePath)) continue;
    try {
      const content = await readFile(filePath, "utf-8");
      items.push(...parseStructuredFile(filename, content, filePath));
    } catch (error) {
      console.error(TAG, `Failed to read ${filePath}:`, error);
    }
  }
  return items;
}

// ========== Frontmatter: parse, merge, serialize ==========

interface ParsedFrontmatter {
  entries: Map<string, string>;
  body: string;
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { entries: new Map(), body: content };
  }

  const entries = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) entries.set(key, value);
  }

  return { entries, body: content.slice(match[0].length) };
}

function mergeFrontmatter(
  existing: Map<string, string>,
  scanned: ScannedProject,
  lastSynced: string
): Map<string, string> {
  const merged = new Map<string, string>();
  merged.set("project", quote(scanned.name));
  merged.set("title", quote(scanned.title));
  merged.set("stack", quoteList(scanned.stack));
  merged.set("repo", quote(scanned.localPath));
  merged.set("remote", quote(scanned.remote));
  merged.set("branch", quote(scanned.branch));
  merged.set("gitStatus", quote(scanned.gitStatus));
  merged.set("lastSynced", quote(lastSynced));

  // cssclasses (Obsidian's per-note styling hook, used to hide the Properties
  // panel — see styles.css) gets our class appended if it's missing, rather
  // than skipped whenever the note already defines one. The earlier version
  // skipped entirely to avoid mangling a value it couldn't safely round-trip
  // — but that meant any note with a pre-existing cssclasses (from a
  // template, or predating this feature) silently never got the hide class,
  // and its Properties panel just stayed visible forever. See
  // mergeCssClasses()'s own comment for what it does and doesn't handle.
  merged.set("cssclasses", mergeCssClasses(existing.get("cssclasses")));

  // Preserve anything else the user (or a future feature) added, in its
  // original order. cssclasses is excluded here — already handled above —
  // otherwise this would immediately overwrite mergeCssClasses()'s result
  // with the untouched original value.
  for (const [key, value] of existing) {
    if (key !== "cssclasses" && !SYNC_KEYS.has(key)) merged.set(key, value);
  }

  return merged;
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Serializes a string list as an inline YAML array, e.g. `["JS", "npm"]` — same inline-array shape mergeCssClasses() below writes for cssclasses. */
function quoteList(values: string[]): string {
  return `[${values.map(quote).join(", ")}]`;
}

/**
 * Builds the `cssclasses` value to write, appending PROJECT_NOTE_CSS_CLASS
 * to whatever's already there instead of skipping when a value exists.
 *
 * Handles the two forms an existing single-line value can take: a bare
 * scalar (`cssclasses: foo`, `cssclasses: "foo"`) and an inline YAML array
 * (`cssclasses: [foo, "bar"]`) — parsed, deduped, and re-emitted as an
 * inline array so it round-trips through this same function on every future
 * sync. Does NOT handle a multi-line YAML block list
 * (`cssclasses:\n  - foo\n  - bar`): `parseFrontmatter`'s line-based parser
 * above can't represent one at all — it already reads a bare `cssclasses:`
 * line as an empty value and silently drops the indented `- item` lines
 * that follow, before this function ever sees it. That data loss is a
 * pre-existing limit of this hand-rolled parser, not something introduced
 * here; fixing it for real needs an actual YAML parser. A block-list note
 * is rare for a single-purpose key like this one, and the practical effect
 * is the same either way — the original list wasn't going to survive a
 * resync regardless of what this function does with it.
 */
function mergeCssClasses(existingRaw: string | undefined): string {
  const classes = existingRaw ? parseCssClassesValue(existingRaw) : [];
  if (!classes.includes(PROJECT_NOTE_CSS_CLASS)) {
    classes.push(PROJECT_NOTE_CSS_CLASS);
  }
  if (classes.length === 1) return quote(classes[0]);
  return `[${classes.map(quote).join(", ")}]`;
}

function parseCssClassesValue(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((entry) => unquoteYamlScalar(entry.trim()))
      .filter((entry) => entry.length > 0);
  }
  return [unquoteYamlScalar(trimmed)];
}

function unquoteYamlScalar(value: string): string {
  const match = value.match(/^"(.*)"$/) ?? value.match(/^'(.*)'$/);
  return match ? match[1] : value;
}

function serializeFrontmatter(entries: Map<string, string>): string {
  const lines = [...entries.entries()].map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join("\n")}\n---\n`;
}
