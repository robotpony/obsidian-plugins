import { ItemView, WorkspaceLeaf, TFile, Menu, Notice, setIcon } from "obsidian";
import { TodoScanner } from "./TodoScanner";
import { TodoProcessor } from "./TodoProcessor";
import { ProjectManager, projectFilePath } from "./ProjectManager";
import { ProjectScanner, ScannedProject } from "./ProjectScanner";
import { ProjectSyncManager } from "./ProjectSyncManager";
import { ParsedProjectItem, ProjectItemType } from "./StructuredFileParser";
import {
  setProjectItemCompletion,
  setProjectItemPriority,
  addProjectItemTag,
  removeProjectItemTag,
} from "./ProjectItemMutator";
import { ContextMenuHandler } from "./ContextMenuHandler";
import { TodoItem, ProjectInfo } from "./types";
import { openFileAtLine } from "./utils";

export const VIEW_TYPE_PROJECTS_SIDEBAR = "warped-todo-projects-sidebar";

export interface ProjectsSidebarOptions {
  baseFolder: string;
  projectsFolder: string;
  excludeDirs: string[];
  scanDepth: number;
  /** Where completing a hand-typed vault item logs to — same setting TodoSidebarView uses. */
  defaultTodoneFile: string;
}

// All three types get a checkbox, matching the main TODOs sidebar's
// ideaConfig (showCheckbox: true) — checking an idea there doesn't mean
// literally "done" so much as "dismiss/convert", but it's still the row's
// only interactive control. Missing here before this fix (found via live
// testing/screenshot review: Ideas rows rendered as plain text with no
// control at all).
const GROUP_ORDER: { heading: string; type: ProjectItemType; checkbox: boolean }[] = [
  { heading: "TODOs", type: "todo", checkbox: true },
  { heading: "Ideas", type: "idea", checkbox: true },
  { heading: "Bugs", type: "bug", checkbox: true },
];

/**
 * Second sidebar alongside TodoSidebarView. List view of detected projects,
 * detail view per project on selection. See DESIGN.md's Projects Extension
 * ("ProjectsSidebarView" / "Detail view") for the full design this implements.
 */
export class ProjectsSidebarView extends ItemView {
  private mode: "list" | "detail" = "list";
  private activeProjectName: string | null = null;
  private filterText: string = "";
  private scannedProjects: ScannedProject[] = [];
  private updateListener: (() => void) | null = null;
  // Tracks the active file's path so handleActiveFileChange can tell "the
  // active file genuinely changed" from "some workspace event fired for the
  // same file" (Obsidian fires these often, for reasons unrelated to
  // navigation). Without this, clicking "< Back" while the project note is
  // still open in the main pane got silently undone by the very next such
  // event, since auto-follow would just re-derive "detail" mode from the
  // still-active file — requiring several clicks before one happened to land
  // in a gap between events. Found via live testing.
  private lastKnownActiveFilePath: string | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private scanner: TodoScanner,
    private processor: TodoProcessor,
    private projectManager: ProjectManager,
    private projectScanner: ProjectScanner,
    private syncManager: ProjectSyncManager,
    private contextMenuHandler: ContextMenuHandler,
    private getOptions: () => ProjectsSidebarOptions,
    private onOpenSettings: () => void,
    private onShowAbout: () => void
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_PROJECTS_SIDEBAR;
  }

  getDisplayText(): string {
    return "Projects";
  }

  getIcon(): string {
    return "folder-git-2";
  }

  async onOpen(): Promise<void> {
    this.updateListener = () => this.render();
    this.scanner.on("todos-updated", this.updateListener);

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.handleActiveFileChange()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.handleActiveFileChange()));

    await this.reload();
  }

  async onClose(): Promise<void> {
    if (this.updateListener) {
      this.scanner.off("todos-updated", this.updateListener);
      this.updateListener = null;
    }
  }

  /** Full rescan + resync of every project, then re-render. Manual "Sync" button and initial load. */
  async reload(): Promise<void> {
    const options = this.getOptions();
    if (options.baseFolder) {
      try {
        this.scannedProjects = await this.syncManager.syncAll({
          baseFolder: options.baseFolder,
          projectsFolder: options.projectsFolder,
          maxDepth: options.scanDepth,
          excludeDirs: options.excludeDirs,
        });
      } catch (error) {
        console.error("[Warped Todo]", "Project sync failed:", error);
        new Notice("Project sync failed. See console for details.");
      }
    }
    this.render();
  }

  /**
   * Applies scan results this view didn't itself request — from a
   * watch-triggered background sync, or the "Sync projects" command, both of
   * which call `syncManager.syncAll()` directly. Just stores and re-renders;
   * must NOT call back into `syncAll()`/`reload()`, or a view wired to run
   * this on every sync completion would trigger another sync completion,
   * forever. Found via live testing: `main.ts` used to route `onSynced`
   * through `reload()`, which re-ran `syncAll()`, which fired `onSynced`
   * again — an unbounded loop limited only by how fast a full scan could
   * complete (observed retriggering roughly every 200ms against a real base
   * folder, visible as `lastSynced` updating that often in the Properties
   * panel).
   */
  applySyncResult(scanned: ScannedProject[]): void {
    this.scannedProjects = scanned;
    this.render();
  }

  // ===== Sidebar/pane sync (auto-follow) =====

  private async handleActiveFileChange(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    const currentPath = activeFile?.path ?? null;
    // Obsidian fires active-leaf-change/file-open often for reasons that
    // aren't "the user navigated somewhere new" (focus changes, layout
    // events). Only re-derive sidebar state when the active file itself
    // actually changed — otherwise "< Back" (which changes the sidebar's
    // mode but not what's open in the main pane) gets silently reverted by
    // the next such event, since the project note is technically still active.
    if (currentPath === this.lastKnownActiveFilePath) return;
    this.lastKnownActiveFilePath = currentPath;

    const projectName = activeFile ? this.projectNameForNotePath(activeFile.path) : null;

    if (projectName) {
      if (this.mode === "detail" && this.activeProjectName === projectName) return;
      this.mode = "detail";
      this.activeProjectName = projectName;
      this.render();
    } else if (this.mode === "detail") {
      this.mode = "list";
      this.activeProjectName = null;
      this.render();
    }
  }

  private projectNameForNotePath(filePath: string): string | null {
    const options = this.getOptions();
    for (const project of this.projectManager.getProjects(this.scannedProjects)) {
      if (!project.localPath) continue; // only repo-matched projects have a note worth auto-following
      const name = project.tag.replace(/^#/, "");
      if (projectFilePath(options.projectsFolder, name) === filePath) return name;
    }
    return null;
  }

  private async openProject(name: string): Promise<void> {
    const options = this.getOptions();
    const path = projectFilePath(options.projectsFolder, name);

    // Set sidebar state and render immediately — don't wait on the file-open
    // round trip first. Also records lastKnownActiveFilePath up front, so
    // once the resulting file-open event reaches handleActiveFileChange, it
    // sees "nothing changed" and skips a second, redundant pass. Previously
    // this awaited openFile() first, which raced against that same event
    // firing mid-await and needing several clicks to land cleanly.
    this.lastKnownActiveFilePath = path;
    this.mode = "detail";
    this.activeProjectName = name;
    this.render();

    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  // ===== Rendering =====

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("warped-todo-projects-view");

    if (this.mode === "detail" && this.activeProjectName) {
      this.renderDetail(container, this.activeProjectName);
    } else {
      this.renderList(container);
    }
  }

  /**
   * Shared by list and detail view — same header slot the TODOs sidebar uses
   * (logo + title, clickable-icon buttons on the right), rather than the
   * plain unbranded buttons this view had before. "Sync" lives in the kebab
   * menu here, same treatment TODOs sidebar gives "Refresh" — not a
   * standalone always-visible button. Found via live testing that the
   * original plain-button header read as unstyled/off-brand.
   */
  private renderHeader(container: HTMLElement, title: string, showBack: boolean): void {
    const headerDiv = container.createDiv({ cls: "sidebar-header" });
    const titleEl = headerDiv.createEl("h4", { cls: "sidebar-title" });
    const logoEl = titleEl.createSpan({ cls: "warped-todo-logo clickable-logo", text: "␣⌘" });
    logoEl.addEventListener("click", () => this.onShowAbout());
    titleEl.appendText(` ${title}`);

    const tabNav = headerDiv.createDiv({ cls: "sidebar-tab-nav" });

    if (showBack) {
      const backBtn = tabNav.createEl("button", {
        cls: "clickable-icon",
        attr: { "aria-label": "Back to project list" },
      });
      setIcon(backBtn, "arrow-left");
      backBtn.addEventListener("click", () => {
        this.mode = "list";
        this.activeProjectName = null;
        this.render();
      });
    }

    const menuBtn = tabNav.createEl("button", {
      cls: "clickable-icon sidebar-menu-btn",
      attr: { "aria-label": "Menu" },
    });
    setIcon(menuBtn, "more-vertical");
    menuBtn.addEventListener("click", (evt) => {
      const menu = new Menu();
      menu.addItem((item) => {
        item
          .setTitle("Sync")
          .setIcon("refresh-cw")
          .onClick(async () => {
            menuBtn.addClass("rotating");
            await this.reload();
            setTimeout(() => menuBtn.removeClass("rotating"), 500);
          });
      });
      menu.showAtMouseEvent(evt);
    });
  }

  private renderList(container: HTMLElement): void {
    const options = this.getOptions();
    this.renderHeader(container, "Projects", false);

    if (!options.baseFolder) {
      const empty = container.createDiv({ cls: "warped-todo-projects-empty" });
      empty.createEl("p", { text: "No base folder configured yet." });
      const btn = empty.createEl("button", { text: "Open settings" });
      btn.addEventListener("click", () => this.onOpenSettings());
      return;
    }

    const filterInput = container.createEl("input", {
      type: "text",
      placeholder: "Filter…",
      cls: "warped-todo-projects-filter",
    }) as HTMLInputElement;
    filterInput.value = this.filterText;

    const listEl = container.createDiv({ cls: "warped-todo-projects-list" });
    filterInput.addEventListener("input", () => {
      this.filterText = filterInput.value;
      this.renderProjectRows(listEl);
    });

    this.renderProjectRows(listEl);
  }

  private renderProjectRows(listEl: HTMLElement): void {
    listEl.empty();
    const filterLower = this.filterText.toLowerCase();

    const projects = this.projectManager
      .getProjects(this.scannedProjects)
      .filter((p) => p.localPath) // list view is repo-matched projects only
      .filter((p) => !filterLower || p.tag.toLowerCase().includes(filterLower))
      .sort((a, b) => {
        const aActive = this.itemCounts(a).total > 0 ? 1 : 0;
        const bActive = this.itemCounts(b).total > 0 ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        return a.tag.localeCompare(b.tag);
      });

    if (projects.length === 0) {
      listEl.createEl("p", { text: "No projects found.", cls: "warped-todo-projects-empty-msg" });
      return;
    }

    for (const project of projects) this.renderProjectRow(listEl, project);
  }

  private itemCounts(project: ProjectInfo): { todo: number; idea: number; bug: number; total: number } {
    if (!project.localPath) return { todo: 0, idea: 0, bug: 0, total: 0 };
    const items = this.syncManager.getCachedItems(project.localPath).filter((i) => !i.completed);
    const counts = { todo: 0, idea: 0, bug: 0, total: 0 };
    for (const item of items) {
      counts[item.itemType]++;
      counts.total++;
    }
    return counts;
  }

  private renderProjectRow(listEl: HTMLElement, project: ProjectInfo): void {
    const name = project.tag.replace(/^#/, "");
    const row = this.renderProjectSummary(listEl, project);
    row.addClass("is-clickable");
    row.addEventListener("click", () => this.openProject(name));
  }

  /**
   * name/branch/status + item-count breakdown — the same block used both as
   * a clickable row in the list view and, unclickable, as the framing header
   * atop the detail view (see renderDetail). Sharing this one renderer is
   * the point: the detail view's top should look like the list row you just
   * clicked, not introduce a second, differently-styled summary of the same
   * three facts. Found via live testing that a separate hand-styled
   * "branch · status" line in the detail view read as visually disconnected
   * from the list it followed from.
   */
  private renderProjectSummary(container: HTMLElement, project: ProjectInfo): HTMLElement {
    const name = project.tag.replace(/^#/, "");
    const counts = this.itemCounts(project);
    const row = container.createDiv({ cls: "warped-todo-project-row" });

    const titleLine = row.createDiv({ cls: "warped-todo-project-row-title" });
    titleLine.createSpan({ text: name, cls: "warped-todo-project-name" });
    if (project.branch) titleLine.createSpan({ text: project.branch, cls: "warped-todo-project-branch" });
    if (project.gitStatus) titleLine.createSpan({ text: project.gitStatus, cls: "warped-todo-project-status" });

    if (counts.total > 0) {
      const parts: string[] = [];
      if (counts.todo > 0) parts.push(`${counts.todo} todo`);
      if (counts.idea > 0) parts.push(`${counts.idea} idea`);
      if (counts.bug > 0) parts.push(`${counts.bug} bug`);
      row.createDiv({ text: parts.join(" · "), cls: "warped-todo-project-row-counts" });
    }
    return row;
  }

  // ===== Detail view =====

  private renderDetail(container: HTMLElement, name: string): void {
    const projects = this.projectManager.getProjects(this.scannedProjects);
    const project = projects.find((p) => p.tag.replace(/^#/, "") === name);

    // Header always reads "Projects", same as the list view — the project's
    // own name isn't repeated there anymore. It was appearing three times at
    // once (native file title, this sidebar header, and the note's own `#
    // name` heading) before this pass; found via live testing/screenshot review.
    this.renderHeader(container, "Projects", true);

    if (!project || !project.localPath) {
      container.createEl("p", { text: `"${name}" is no longer a detected project.` });
      return;
    }

    const info = container.createDiv({ cls: "warped-todo-project-info" });
    // Same summary block the list row uses (name/branch/status + counts) —
    // frames the detail view as "the row you just clicked, expanded" rather
    // than a differently-styled restatement of the same facts.
    this.renderProjectSummary(info, project);

    const actions = info.createDiv({ cls: "warped-todo-project-info-actions" });
    if (project.remote) {
      const url = browsableUrl(project.remote);
      const link = actions.createEl("a", {
        cls: "warped-todo-project-info-action",
        href: url,
        attr: { title: url },
      });
      setIcon(link.createSpan(), "external-link");
      link.createSpan({ text: url.replace(/^https?:\/\//, "") });
      link.setAttr("target", "_blank");
    }
    const revealBtn = actions.createEl("a", {
      cls: "warped-todo-project-info-action",
      attr: { title: project.localPath },
    });
    setIcon(revealBtn.createSpan(), "folder-open");
    revealBtn.createSpan({ text: homeRelativePath(project.localPath) });
    revealBtn.addEventListener("click", () => this.revealInFinder(project.localPath!));

    const itemsContainer = container.createDiv({ cls: "warped-todo-project-items" });
    this.renderItemGroups(itemsContainer, project);
  }

  private revealInFinder(path: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const electron = require("electron");
      const shell = electron.remote?.shell ?? electron.shell;
      shell.showItemInFolder(path);
    } catch (error) {
      console.error("[Warped Todo]", "Failed to reveal folder:", error);
      new Notice("Couldn't open Finder. See console for details.");
    }
  }

  /** Opens a synced item's source file (a plain filesystem path, not necessarily inside the vault) in the OS default editor — the external-file equivalent of openFileAtLine for a vault TFile. */
  private openExternalFile(path: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const electron = require("electron");
      const shell = electron.remote?.shell ?? electron.shell;
      shell.openPath(path);
    } catch (error) {
      console.error("[Warped Todo]", "Failed to open file:", error);
      new Notice("Couldn't open file. See console for details.");
    }
  }

  /**
   * Two sources, concatenated — see DESIGN.md's "Item list — two sources, no
   * reverse-mapping": synced items come from `syncManager.getCachedItems()`
   * (parsed straight from each repo's BUGS.md/TODO.md/etc., not from the vault
   * note — the note's body is never written to for items, see
   * ProjectSyncManager's class doc comment); hand-typed items come from a
   * normal TodoScanner vault scan of this same note's `## Overview` (or
   * anywhere else in it).
   *
   * Group headings and item rows reuse the TODOs sidebar's own CSS classes
   * (`.todo-orphan-section*`, `.todo-checkbox*`, `.todo-text`) rather than
   * parallel ones, so this view is styled identically by construction instead
   * of by trying to hand-match colours/weights — found via live testing that
   * the earlier hand-rolled styling didn't actually match.
   */
  private renderItemGroups(container: HTMLElement, project: ProjectInfo): void {
    const name = project.tag.replace(/^#/, "");
    const syncedItems = this.syncManager.getCachedItems(project.localPath!);

    for (const group of GROUP_ORDER) {
      const groupItems = syncedItems.filter((i) => i.itemType === group.type);
      if (groupItems.length === 0) continue;
      const groupEl = container.createDiv({ cls: "warped-todo-project-item-group" });
      this.renderGroupHeading(groupEl, group.heading, this.syncedGroupFileHint(groupItems));
      for (const item of groupItems) {
        this.renderSyncedItemRow(groupEl, item, name, group.checkbox, project.localPath!);
      }
    }

    const handTypedGroups = this.buildHandTypedGroups(name);
    for (const group of handTypedGroups) {
      const groupEl = container.createDiv({ cls: "warped-todo-project-item-group" });
      this.renderGroupHeading(groupEl, group.label, {
        displayName: group.file.name,
        path: group.file.path,
        onOpen: () => openFileAtLine(this.app, group.file, group.lineNumber),
      });
      for (const item of group.items) this.renderHandTypedItemRow(groupEl, item);
    }

    if (syncedItems.length === 0 && handTypedGroups.length === 0) {
      container.createEl("p", { text: "No tracked items.", cls: "warped-todo-projects-empty-msg" });
    }
  }

  /**
   * A group's file hint, when every item in it came from the same source
   * file (the common case — one BUGS.md or TODO.md per repo). Omitted, not
   * guessed, when a group spans more than one file, so the hint never points
   * at the wrong one.
   */
  private syncedGroupFileHint(items: ParsedProjectItem[]): GroupFileHint | undefined {
    const paths = new Set(items.map((i) => i.sourceFile));
    if (paths.size !== 1) return undefined;
    const path = items[0].sourceFile;
    return {
      displayName: path.split("/").pop() ?? path,
      path,
      onOpen: () => this.openExternalFile(path),
    };
  }

  /**
   * `fileHint` supplies the visible filename + click-through arrow — same
   * affordance the main TODOs sidebar gives a header-with-children row
   * (`.header-filename` + `→`, see SidebarView.ts's renderTodoItem). Missing
   * here before this pass (found via live testing/screenshot review): group
   * headings rendered a bare label with no indication of, or way to jump to,
   * the source file.
   */
  private renderGroupHeading(groupEl: HTMLElement, label: string, fileHint?: GroupFileHint): void {
    const heading = groupEl.createDiv({ cls: "todo-orphan-section" });
    heading.createSpan({ cls: "todo-orphan-section-text", text: label });
    if (!fileHint) return;
    heading.createSpan({
      cls: "header-filename",
      text: fileHint.displayName,
      attr: { title: fileHint.path },
    });
    const link = heading.createEl("a", {
      cls: "todo-orphan-section-link",
      text: "→",
      href: "#",
      attr: { "aria-label": `Open ${fileHint.path}` },
    });
    link.addEventListener("click", (evt) => {
      evt.preventDefault();
      fileHint.onOpen();
    });
  }

  /**
   * Groups hand-typed items the same way the TODOs sidebar itself does: a
   * header TODO's children belong under it (labelled with the header's own
   * text, cleaned — not rendered as a checkbox row itself, since a header
   * with children can't be completed directly), and true orphans (no parent
   * header) group by `sectionLabel`. Getting this wrong was the actual bug —
   * treating every scanned item as an independent checkbox row showed a
   * header's raw markdown text (`### bugs #todo #project`) as its own row,
   * on top of its children, with no connection between the two.
   */
  private buildHandTypedGroups(projectName: string): HandTypedGroup[] {
    return groupHandTypedItems(this.handTypedItems(projectName));
  }

  /** Vault-scanned #todo/#idea items hand-typed into this note (the whole note — there's no sync-owned region to exclude anymore). */
  private handTypedItems(projectName: string): TodoItem[] {
    const options = this.getOptions();
    const notePath = projectFilePath(options.projectsFolder, projectName);
    return [...this.scanner.getTodos(), ...this.scanner.getIdeas()].filter(
      (t) => t.filePath === notePath
    );
  }

  private renderSyncedItemRow(
    container: HTMLElement,
    item: ParsedProjectItem,
    projectName: string,
    checkbox: boolean,
    repoPath: string
  ): void {
    const row = container.createDiv({ cls: "warped-todo-project-item-row todo-item" });
    if (checkbox) {
      const wrap = row.createDiv({ cls: "todo-checkbox-wrap" });
      const cb = wrap.createEl("input", { type: "checkbox", cls: "todo-checkbox" }) as HTMLInputElement;
      cb.checked = item.completed;
      cb.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        // headerNested (Phase 6 Case 1) needs repoPath/scanner for its git-clean
        // safety check; harmless to pass for other shapes, which ignore it.
        const ok = await setProjectItemCompletion(item, !item.completed, {
          repoPath,
          scanner: this.projectScanner,
        });
        if (ok) await this.resyncActiveProject();
      });
    }
    row.createSpan({ text: cleanDisplayText(item.text), cls: "todo-text" });
    row.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.showSyncedItemMenu(evt, item);
    });
  }

  private renderHandTypedItemRow(container: HTMLElement, item: TodoItem): void {
    const row = container.createDiv({ cls: "warped-todo-project-item-row todo-item" });
    if (item.hasCheckbox) {
      const wrap = row.createDiv({ cls: "todo-checkbox-wrap" });
      const cb = wrap.createEl("input", { type: "checkbox", cls: "todo-checkbox" }) as HTMLInputElement;
      cb.checked = false; // getTodos() only returns active items — never pre-checked
      cb.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        const ok = await this.processor.completeTodo(item, this.getOptions().defaultTodoneFile);
        if (ok) this.render();
      });
    }
    row.createSpan({ text: cleanDisplayText(item.text), cls: "todo-text" });
    row.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.contextMenuHandler.showTodoMenu(evt, item, () => this.render(), false);
    });
  }

  private showSyncedItemMenu(evt: MouseEvent, item: ParsedProjectItem): void {
    const menu = new Menu();
    const hasFocus = item.tags.includes("#focus");
    const hasFuture = item.tags.includes("#future");
    const currentPriority = item.tags.find((t) => /^#p[0-4]$/.test(t)) ?? null;
    const hasLaterPriority = currentPriority !== null && /^#p[3-4]$/.test(currentPriority);

    menu.addItem((mi) => {
      mi.setTitle("Copy").setIcon("copy").onClick(async () => {
        await navigator.clipboard.writeText(item.text);
      });
    });

    menu.addItem((mi) => {
      mi.setTitle(hasFocus ? "Unfocus" : "Focus")
        .setIcon("zap")
        .onClick(async () => {
          const ok = hasFocus
            ? await removeProjectItemTag(item, "#focus")
            : await setProjectItemPriority(item, calculateFocusPriority(currentPriority), true);
          if (ok) await this.resyncActiveProject();
        });
    });

    menu.addItem((mi) => {
      mi.setTitle(hasLaterPriority ? "Unlater" : "Later")
        .setIcon("clock")
        .onClick(async () => {
          const ok = hasLaterPriority
            ? await removeProjectItemTag(item, currentPriority!)
            : await setProjectItemPriority(item, calculateLaterPriority(currentPriority));
          if (ok) await this.resyncActiveProject();
        });
    });

    menu.addItem((mi) => {
      mi.setTitle(hasFuture ? "Unsnooze" : "Snooze")
        .setIcon("moon")
        .onClick(async () => {
          const ok = hasFuture
            ? await removeProjectItemTag(item, "#future")
            : await addProjectItemTag(item, "#future");
          if (ok) await this.resyncActiveProject();
        });
    });

    menu.showAtMouseEvent(evt);
  }

  /**
   * Re-reads the active project's structured files after a mutation and
   * updates the sidebar's item cache directly, so the change is visible
   * immediately without a vault write — items live only in the sidebar's
   * cache now, not in the note body, so there's nothing in the vault that
   * needs rewriting just to reflect a completion/priority/tag change.
   */
  private async resyncActiveProject(): Promise<void> {
    if (!this.activeProjectName) return;
    const scanned = this.scannedProjects.find((p) => p.name === this.activeProjectName);
    if (!scanned) return;

    const items = await this.syncManager.getProjectItems(scanned.localPath);
    this.syncManager.updateCachedItems(scanned.localPath, items);

    this.render();
  }
}

function calculateFocusPriority(currentPriority: string | null): string {
  if (!currentPriority || currentPriority === "#future") return "#p0";
  const match = currentPriority.match(/^#p([0-4])$/);
  if (match) {
    const num = parseInt(match[1]);
    return num > 0 ? `#p${num - 1}` : "#p0";
  }
  return "#p0";
}

function calculateLaterPriority(currentPriority: string | null): string {
  if (!currentPriority || currentPriority === "#future") return "#p4";
  const match = currentPriority.match(/^#p([0-4])$/);
  if (match) {
    const num = parseInt(match[1]);
    return num < 4 ? `#p${num + 1}` : "#p4";
  }
  return "#p4";
}

function cleanDisplayText(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, "")
    .replace(/^-\s*/, "")
    .replace(/^\[[ xX]?\]\s*/, "")
    .replace(/#[\w-]+/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function browsableUrl(remote: string): string {
  // git@github.com:owner/repo.git -> https://github.com/owner/repo
  const sshMatch = remote.match(/^git@([^:]+):(.+?)(\.git)?$/);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;
  return remote.replace(/\.git$/, "");
}

/** /Users/mx/projects/peep -> ~/projects/peep — shorter, and immediately recognizable as a local path rather than plain text. Full path stays available via the element's title tooltip. */
export function homeRelativePath(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const home: string = require("os").homedir();
  return path === home || path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}

interface GroupFileHint {
  displayName: string;
  path: string;
  onOpen: () => void;
}

interface HandTypedGroup {
  label: string;
  file: TFile;
  lineNumber: number;
  items: TodoItem[];
}

/** A header TODO with children can't be completed directly (TodoProcessor refuses it) — same rule the TODOs sidebar uses to decide whether a header row gets its own checkbox. */
function isHeaderWithChildren(item: TodoItem): boolean {
  return item.isHeader === true && !!item.childLineNumbers && item.childLineNumbers.length > 0;
}

/**
 * Groups a flat hand-typed item list the way the TODOs sidebar itself does:
 * a header TODO's children belong under it (labelled with the header's own
 * cleaned text; the header itself isn't a row — see isHeaderWithChildren),
 * true orphans (no parent header) group by sectionLabel. Extracted as a
 * standalone function (not a method) specifically so it's unit-testable
 * without constructing a whole ItemView — this grouping logic is the actual
 * bug that was fixed here (every scanned item rendered as an independent
 * checkbox row, showing a header's raw markdown text as its own row).
 */
export function groupHandTypedItems(items: TodoItem[]): HandTypedGroup[] {
  const headerGroups = new Map<number, HandTypedGroup>();
  for (const item of items) {
    if (isHeaderWithChildren(item)) {
      headerGroups.set(item.lineNumber, {
        label: cleanDisplayText(item.text),
        file: item.file,
        lineNumber: item.lineNumber,
        items: [],
      });
    }
  }

  const orphanGroups = new Map<string, HandTypedGroup>();
  for (const item of items) {
    if (isHeaderWithChildren(item)) continue; // the header itself isn't a row — see above
    if (item.parentLineNumber !== undefined && headerGroups.has(item.parentLineNumber)) {
      headerGroups.get(item.parentLineNumber)!.items.push(item);
      continue;
    }
    const label = item.sectionLabel || "Notes";
    if (!orphanGroups.has(label)) {
      orphanGroups.set(label, {
        label,
        file: item.file,
        lineNumber: item.sectionLineNumber ?? item.lineNumber,
        items: [],
      });
    }
    orphanGroups.get(label)!.items.push(item);
  }

  return [...headerGroups.values(), ...orphanGroups.values()].filter((g) => g.items.length > 0);
}
