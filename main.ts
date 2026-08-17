import {
  App,
  MarkdownView,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from "obsidian";
import { TodoScanner } from "./src/TodoScanner";
import { TodoProcessor } from "./src/TodoProcessor";
import { ProjectManager } from "./src/ProjectManager";
import { ProjectScanner } from "./src/ProjectScanner";
import { ProjectSyncManager } from "./src/ProjectSyncManager";
import {
  ProjectsSidebarView,
  VIEW_TYPE_PROJECTS_SIDEBAR,
} from "./src/ProjectsSidebarView";
import { ContextMenuHandler } from "./src/ContextMenuHandler";
import { SlashCommandSuggest } from "./src/SlashCommandSuggest";
import { AtSuggest } from "./src/AtSuggest";
import { TeamManager } from "./src/TeamManager";
import {
  TodoSidebarView,
  VIEW_TYPE_TODO_SIDEBAR,
} from "./src/SidebarView";
import {
  WarpedTodoSettings,
  DEFAULT_SETTINGS,
  TodoItem,
} from "./src/types";
import { convertToSlackMarkdown } from "./src/SlackConverter";
import { convertToNotionMarkdown } from "./src/NotionConverter";
import { extractTags, showNotice } from "./src/utils";
import { MoveTargetModal } from "./src/MoveTargetModal";
import { TabLockManager } from "./src/TabLockManager";
import { createHeaderSortPlugin } from "./src/HeaderSortExtension";
import { createHeaderChecklistExtension } from "./src/HeaderChecklistExtension";
import { SidebarManager } from "./src/shared";

export default class WarpedTodoPlugin extends Plugin {
  settings: WarpedTodoSettings;
  scanner: TodoScanner;
  processor: TodoProcessor;
  projectManager: ProjectManager;
  projectScanner: ProjectScanner;
  projectSyncManager: ProjectSyncManager;
  tabLockManager: TabLockManager;
  teamManager: TeamManager;
  private sidebarManager: SidebarManager;
  private projectsSidebarManager: SidebarManager;

  async onload() {
    await this.loadSettings();

    // If the user has opted out of persisting Focus Mode across sessions, reset
    // the persisted active flag at startup so the sidebar opens in normal mode.
    if (!this.settings.focusModePersist && this.settings.focusModeActive) {
      this.settings.focusModeActive = false;
      await this.saveSettings();
    }

    // Initialize sidebar managers
    this.sidebarManager = new SidebarManager(this.app, VIEW_TYPE_TODO_SIDEBAR);
    this.projectsSidebarManager = new SidebarManager(this.app, VIEW_TYPE_PROJECTS_SIDEBAR);

    // Initialize team manager
    this.teamManager = new TeamManager(this.app, this.settings.teamFilePath);
    this.teamManager.watchFile();

    // Initialize core components
    this.scanner = new TodoScanner(this.app);
    this.processor = new TodoProcessor(this.app, this.settings.dateFormat);
    this.processor.setScanner(this.scanner);
    this.projectManager = new ProjectManager(
      this.app,
      this.scanner,
      this.settings.defaultProjectsFolder,
      this.settings.priorityTags,
      this.settings.excludeFoldersFromProjects
    );
    this.projectScanner = new ProjectScanner();
    // onSynced must apply results directly (applySyncResult), not go through
    // SidebarManager.refresh()/view.reload() — reload() itself calls
    // syncAll(), which would fire onSynced again: an unbounded loop. See
    // ProjectsSidebarView.applySyncResult's doc comment for how this was found.
    this.projectSyncManager = new ProjectSyncManager(this.app, this.projectScanner, (scanned) =>
      this.projectsSidebarManager.forEach<ProjectsSidebarView>((view) => view.applySyncResult(scanned))
    );
    // Desktop-only feature (Node fs/child_process — see manifest.json's isDesktopOnly).
    // Only starts watching if a base folder is actually configured.
    if (this.settings.projectsBaseFolder) {
      this.projectSyncManager.startWatching(this.projectsSyncOptions());
    }
    // Initialize tab lock manager
    this.tabLockManager = new TabLockManager(this.app);

    // Enable tab lock buttons if setting is enabled
    if (this.settings.showTabLockButton) {
      this.app.workspace.onLayoutReady(() => {
        this.tabLockManager.enable();
      });
    }

    // Configure scanner to exclude TODONE archive file from all lists
    if (this.settings.excludeTodoneFilesFromRecent) {
      this.scanner.setExcludeFiles([this.settings.defaultTodoneFile]);
    }

    // Set up processor callback to trigger re-scan after completion
    this.processor.setOnCompleteCallback(() => {
      // File will be modified, which will trigger scanner's file watcher
      this.app.workspace.trigger("markdown-changed");
    });

    // Track move-to targets for the file picker
    this.processor.setOnMoveHistoryUpdate(async (path: string) => {
      const history = this.settings.moveHistory.filter(p => p !== path);
      history.unshift(path);
      this.settings.moveHistory = history.slice(0, 10);
      await this.saveData(this.settings);
    });

    // Set up file watchers immediately so changes during startup are not missed.
    // The metadataCache.on("changed") watcher (the primary trigger) is safe to
    // register before the cache is resolved — it simply won't fire until files
    // are indexed.
    this.scanner.watchFiles();

    // Defer the initial vault scan until the workspace layout is ready.
    // onLayoutReady fires after Obsidian's metadata cache has finished its
    // initial indexing pass, ensuring getFileCache() returns accurate results
    // for the pre-filter check introduced in phase 3.
    this.app.workspace.onLayoutReady(async () => {
      await this.teamManager.load();
      await this.scanner.scanVault();

      // Activate the sidebar after the scan so it has data to show on first render.
      if (this.settings.showSidebarByDefault) {
        this.sidebarManager.activate();
      }
    });

    // Register editor extension for header sort buttons
    this.registerEditorExtension(
      createHeaderSortPlugin(this.app, this.processor, this.scanner)
    );

    // Register editor extension for auto-inserting checklists after tagged headers
    this.registerEditorExtension(createHeaderChecklistExtension());

    // Watch for native checkbox clicks on #todo lines
    this.registerDomEvent(document, "change", async (evt) => {
      const target = evt.target as HTMLInputElement;

      // Only handle checkbox changes in the editor
      if (!target.matches('input[type="checkbox"].task-list-item-checkbox')) {
        return;
      }

      // Only process if checkbox was just checked (not unchecked)
      if (!target.checked) {
        return;
      }

      // Give Obsidian time to update the file
      await new Promise((resolve) => setTimeout(resolve, 100));

      const file = this.app.workspace.getActiveFile();
      if (!file) return;

      // Read the updated file content to find any #todo with [x]
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Find lines with #todo (not #todone) that have completed checkbox
        if (
          line.includes("#todo") &&
          !line.includes("#todone") &&
          /^-\s*\[x\]/i.test(line.trim())
        ) {
          // This is a #todo line with a checked checkbox - process it
          const todos = this.scanner.getTodos();
          const todo = todos.find(
            (t) => t.file.path === file.path && t.lineNumber === i
          );

          if (todo) {
            await this.processor.completeTodo(
              todo,
              this.settings.defaultTodoneFile
            );
            break; // Process one at a time
          }
        }
      }
    });

    // Register sidebar view
    this.registerView(
      VIEW_TYPE_TODO_SIDEBAR,
      (leaf) =>
        new TodoSidebarView(
          leaf,
          this.scanner,
          this.processor,
          this.projectManager,
          this.settings.defaultTodoneFile,
          this.settings.priorityTags,
          this.settings.activeTodosLimit,
          this.settings.focusListLimit,
          this.settings.makeLinksClickable,
          () => this.showAboutModal(),
          () => this.showStatsModal(),
          () => this.settings.moveHistory,
          this.teamManager,
          this.settings.defaultAssignee,
          this.settings.focusQueueLimit,
          this.settings.focusModeActive,
          async (active: boolean) => {
            this.settings.focusModeActive = active;
            await this.saveSettings();
          }
        )
    );

    // Sidebar is activated inside onLayoutReady above (after scanVault completes).

    // Register editor suggesters for slash commands and @date/@user
    this.registerEditorSuggest(new SlashCommandSuggest(this.app, this.settings));
    this.registerEditorSuggest(new AtSuggest(this.app, this.settings, this.teamManager));

    // Commands
    this.addCommand({
      id: "toggle-todo-sidebar",
      name: "Toggle TODO Sidebar",
      callback: () => {
        this.sidebarManager.toggle();
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "t",
        },
      ],
    });

    this.addCommand({
      id: "quick-add-todo",
      name: "Quick Add TODO",
      editorCallback: (editor, view) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        // If line is empty or whitespace, insert a new todo
        if (line.trim() === "") {
          editor.replaceRange("- [ ] #todo ", cursor);
          editor.setCursor({ line: cursor.line, ch: 6 });
        } else {
          // Append #todo to the end of the line
          const endOfLine = { line: cursor.line, ch: line.length };
          editor.replaceRange(" #todo", endOfLine);
        }
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "a",
        },
      ],
    });

    this.addCommand({
      id: "refresh-todos",
      name: "Refresh TODOs",
      callback: async () => {
        await this.scanner.scanVault();
        this.sidebarManager.refresh();
      },
    });

    this.addCommand({
      id: "move-todo",
      name: "Move TODO to another file",
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const tags = extractTags(line);

        if (!tags.includes("#todo") && !tags.includes("#todos")) {
          showNotice("Cursor is not on a #todo line");
          return;
        }

        // Find the matching TodoItem from scanner
        const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (!file) return;

        const todos = this.scanner.getTodos();
        const todo = todos.find(
          (t) => t.file.path === file.path && t.lineNumber === cursor.line
        );

        if (!todo) {
          showNotice("Could not find TODO at cursor");
          return;
        }

        new MoveTargetModal(
          this.app,
          this.settings.moveHistory,
          file.path,
          async (targetFile) => {
            await this.processor.moveTodo(todo, targetFile.path);
          }
        ).open();
      },
    });

    this.addCommand({
      id: "copy-as-slack",
      name: "Copy as Slack Markdown",
      editorCallback: async (editor) => {
        const selection = editor.getSelection();
        if (!selection) {
          showNotice("No text selected");
          return;
        }
        const slackMd = convertToSlackMarkdown(selection);
        await navigator.clipboard.writeText(slackMd);
        showNotice("Copied as Slack markdown");
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "c",
        },
      ],
    });

    this.addCommand({
      id: "copy-as-notion",
      name: "Copy as Notion Markdown",
      editorCallback: async (editor) => {
        const selection = editor.getSelection();
        if (!selection) {
          showNotice("No text selected");
          return;
        }
        const notionMd = convertToNotionMarkdown(selection);
        await navigator.clipboard.writeText(notionMd);
        showNotice("Copied as Notion markdown");
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "n",
        },
      ],
    });

    // Editor context menu: Copy as Slack, Copy as Notion, and Define
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selection = editor.getSelection();
        if (selection) {
          menu.addItem((item) => {
            item
              .setTitle("Copy as Slack")
              .setIcon("clipboard-copy")
              .onClick(async () => {
                const slackMd = convertToSlackMarkdown(selection);
                await navigator.clipboard.writeText(slackMd);
                showNotice("Copied as Slack markdown");
              });
          });
          menu.addItem((item) => {
            item
              .setTitle("Copy as Notion")
              .setIcon("clipboard-copy")
              .onClick(async () => {
                const notionMd = convertToNotionMarkdown(selection);
                await navigator.clipboard.writeText(notionMd);
                showNotice("Copied as Notion markdown");
              });
          });
        }
      })
    );

    // Register Projects sidebar view
    this.registerView(
      VIEW_TYPE_PROJECTS_SIDEBAR,
      (leaf) =>
        new ProjectsSidebarView(
          leaf,
          this.scanner,
          this.processor,
          this.projectManager,
          this.projectScanner,
          this.projectSyncManager,
          new ContextMenuHandler(
            this.app,
            this.processor,
            this.settings.priorityTags,
            () => this.settings.moveHistory
          ),
          () => this.projectsSyncOptions(),
          () => {
            (this.app as any).setting.open();
            (this.app as any).setting.openTabById(this.manifest.id);
          },
          () => this.showAboutModal()
        )
    );

    this.addCommand({
      id: "toggle-projects-sidebar",
      name: "Toggle Projects Sidebar",
      callback: () => {
        this.projectsSidebarManager.toggle();
      },
    });

    this.addCommand({
      id: "sync-projects",
      name: "Sync Projects",
      callback: async () => {
        // Runs independent of whether the sidebar is open — onSynced (wired in
        // the ProjectSyncManager constructor above) refreshes it automatically
        // if it happens to be.
        if (!this.settings.projectsBaseFolder) {
          showNotice("No Projects base folder configured yet. Set one in settings.");
          return;
        }
        await this.projectSyncManager.syncAll(this.projectsSyncOptions());
        showNotice("Projects synced.");
      },
    });

    // Add ribbon icons
    this.addRibbonIcon("square-check-big", "Toggle TODO Sidebar", () => {
      this.sidebarManager.toggle();
    });
    this.addRibbonIcon("folder-git-2", "Toggle Projects Sidebar", () => {
      this.projectsSidebarManager.toggle();
    });

    // Add settings tab
    this.addSettingTab(new WarpedTodoSettingTab(this.app, this));
  }

  /** Builds ProjectSyncManager's SyncOptions/ProjectsSidebarOptions from current settings. */
  projectsSyncOptions() {
    return {
      baseFolder: this.settings.projectsBaseFolder,
      projectsFolder: this.settings.defaultProjectsFolder,
      excludeDirs: this.settings.projectsExcludeDirs,
      scanDepth: this.settings.projectsScanDepth,
      maxDepth: this.settings.projectsScanDepth,
      defaultTodoneFile: this.settings.defaultTodoneFile,
    };
  }

  onunload() {
    // Detach all sidebar views
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TODO_SIDEBAR);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_PROJECTS_SIDEBAR);
    // Clean up tab lock manager
    this.tabLockManager.destroy();
    // Stop the Projects file watcher (fs.watch doesn't clean itself up)
    this.projectSyncManager?.stopWatching();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /** Refresh all sidebar views (delegates to SidebarManager). */
  refreshSidebar() {
    this.sidebarManager.refresh();
  }

  showAboutModal() {
    new AboutModal(this.app, this.manifest.version).open();
  }

  showStatsModal() {
    new StatsModal(this.app, this.scanner).open();
  }

}

// About modal for displaying plugin information
class AboutModal extends Modal {
  private version: string;

  constructor(app: App, version: string) {
    super(app);
    this.version = version;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("warped-todo-about-modal");

    // Logo and title
    const header = contentEl.createEl("div", { cls: "about-header" });
    header.createEl("span", { cls: "warped-todo-logo about-logo", text: "␣⌘" });
    header.createEl("h2", { text: "Warped Todo" });

    // Version
    contentEl.createEl("p", { cls: "about-version", text: `Version ${this.version}` });

    // Blurb
    contentEl.createEl("p", {
      cls: "about-blurb",
      text: "Focus on the right next task. Simple TODOs and tags in your markdown, surfaced when you need them.",
    });

    // Details
    const details = contentEl.createEl("div", { cls: "about-details" });
    details.createEl("p", { text: "Author: Bruce Alderson" });

    const repoLink = details.createEl("p");
    repoLink.appendText("Repository: ");
    repoLink.createEl("a", {
      text: "github.com/robotpony/obsidian-plugins",
      href: "https://github.com/robotpony/obsidian-plugins",
    });

    details.createEl("p", { text: "Made in 🇨🇦", cls: "about-made-in" });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// Stats modal for displaying vault statistics
class StatsModal extends Modal {
  private scanner: TodoScanner;

  constructor(app: App, scanner: TodoScanner) {
    super(app);
    this.scanner = scanner;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("warped-todo-stats-modal");

    // Header
    const header = contentEl.createEl("div", { cls: "stats-header" });
    header.createEl("span", { cls: "warped-todo-logo stats-logo", text: "␣⌘" });
    header.createEl("h2", { text: "Vault Statistics" });

    // Gather stats
    const todos = this.scanner.getTodos();
    const todones = this.scanner.getTodones();
    const ideas = this.scanner.getIdeas();
    const principles = this.scanner.getPrinciples();

    // Count focused items
    const focusedTodos = todos.filter(t => t.tags.includes("#focus")).length;
    const focusedIdeas = ideas.filter(i => i.tags.includes("#focus")).length;

    // Count snoozed items
    const snoozedTodos = todos.filter(t => t.tags.includes("#future")).length;

    // Stats grid
    const statsGrid = contentEl.createEl("div", { cls: "stats-grid" });

    // TODOs section
    const todosSection = statsGrid.createEl("div", { cls: "stats-section" });
    todosSection.createEl("h3", { text: "TODOs" });
    this.createStatRow(todosSection, "Active", todos.length);
    this.createStatRow(todosSection, "Focused", focusedTodos);
    this.createStatRow(todosSection, "Snoozed", snoozedTodos);
    this.createStatRow(todosSection, "Completed", todones.length);

    // Ideas section
    const ideasSection = statsGrid.createEl("div", { cls: "stats-section" });
    ideasSection.createEl("h3", { text: "Ideas" });
    this.createStatRow(ideasSection, "Total", ideas.length);
    this.createStatRow(ideasSection, "Focused", focusedIdeas);

    // Principles section
    const principlesSection = statsGrid.createEl("div", { cls: "stats-section" });
    principlesSection.createEl("h3", { text: "Principles" });
    this.createStatRow(principlesSection, "Total", principles.length);

    // Summary
    const summarySection = contentEl.createEl("div", { cls: "stats-summary" });
    const total = todos.length + todones.length + ideas.length + principles.length;
    summarySection.createEl("p", {
      text: `Total tracked items: ${total}`,
      cls: "stats-total"
    });
  }

  private createStatRow(container: HTMLElement, label: string, value: number): void {
    const row = container.createEl("div", { cls: "stats-row" });
    row.createEl("span", { cls: "stats-label", text: label });
    row.createEl("span", { cls: "stats-value", text: String(value) });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class WarpedTodoSettingTab extends PluginSettingTab {
  plugin: WarpedTodoPlugin;

  constructor(app: App, plugin: WarpedTodoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Warped Todo Settings" });

    // About section
    const aboutSection = containerEl.createEl("div", { cls: "warped-todo-about-section" });
    const aboutHeader = aboutSection.createEl("div", { cls: "about-header" });
    aboutHeader.createEl("span", { cls: "warped-todo-logo about-logo", text: "␣⌘" });
    aboutHeader.createEl("span", { cls: "about-title", text: "Warped Todo" });

    aboutSection.createEl("p", {
      cls: "about-blurb",
      text: "Focus on the right next task. Simple TODOs and tags in your markdown, surfaced when you need them.",
    });

    aboutSection.createEl("p", { cls: "about-version", text: `Version ${this.plugin.manifest.version}` });

    const aboutDetails = aboutSection.createEl("div", { cls: "about-details" });
    aboutDetails.createEl("span", { text: "By Bruce Alderson" });
    aboutDetails.appendText(" · ");
    aboutDetails.createEl("a", {
      text: "GitHub",
      href: "https://github.com/robotpony/obsidian-plugins",
    });

    // Sidebar section (first)
    containerEl.createEl("h3", { text: "Sidebar" });

    new Setting(containerEl)
      .setName("Show sidebar by default")
      .setDesc("Show the TODO sidebar when Obsidian starts")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showSidebarByDefault)
          .onChange(async (value) => {
            this.plugin.settings.showSidebarByDefault = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show tab lock buttons")
      .setDesc("Add lock buttons to tab headers. Locked tabs force links to open in new tabs.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showTabLockButton)
          .onChange(async (value) => {
            this.plugin.settings.showTabLockButton = value;
            if (value) {
              this.plugin.tabLockManager.enable();
            } else {
              this.plugin.tabLockManager.disable();
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Make links clickable in lists")
      .setDesc("Render wiki links and markdown links as clickable in the sidebar. When disabled, links display as plain text without markdown syntax.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.makeLinksClickable)
          .onChange(async (value) => {
            this.plugin.settings.makeLinksClickable = value;
            await this.plugin.saveSettings();
            this.plugin.refreshSidebar();
          })
      );

    // TODOs section
    containerEl.createEl("h3", { text: "TODOs" });

    new Setting(containerEl)
      .setName("Default TODONE file")
      .setDesc("Default file path for logging completed TODOs")
      .addText((text) =>
        text
          .setPlaceholder("todos/done.md")
          .setValue(this.plugin.settings.defaultTodoneFile)
          .onChange(async (value) => {
            this.plugin.settings.defaultTodoneFile = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Date format")
      .setDesc("Format for completion dates. e.g. YYYY-MM-DD → 2026-05-09, D/M/YYYY → 9/5/2026")
      .addText((text) =>
        text
          .setPlaceholder("YYYY-MM-DD")
          .setValue(this.plugin.settings.dateFormat)
          .onChange(async (value) => {
            this.plugin.settings.dateFormat = value;
            this.plugin.processor = new TodoProcessor(
              this.app,
              value
            );
            await this.plugin.saveSettings();
          })
      );

    // Projects section
    containerEl.createEl("h3", { text: "Projects" });

    new Setting(containerEl)
      .setName("Default projects folder")
      .setDesc("Folder scanned for project files. TODOs here get automatic project tags if no explicit tag is set (e.g., projects/)")
      .addText((text) =>
        text
          .setPlaceholder("projects/")
          .setValue(this.plugin.settings.defaultProjectsFolder)
          .onChange(async (value) => {
            this.plugin.settings.defaultProjectsFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Project list limit")
      .setDesc("Maximum number of projects to show in the tag cloud")
      .addText((text) =>
        text
          .setPlaceholder("5")
          .setValue(String(this.plugin.settings.focusListLimit))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.focusListLimit = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Active TODOs limit")
      .setDesc("Maximum number of TODOs to show in sidebar (0 for unlimited)")
      .addText((text) =>
        text
          .setPlaceholder("5")
          .setValue(String(this.plugin.settings.activeTodosLimit))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.activeTodosLimit = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Exclude folders from projects")
      .setDesc("Comma-separated folders to exclude from inferred project tags (e.g., log, archive)")
      .addText((text) =>
        text
          .setPlaceholder("log")
          .setValue(this.plugin.settings.excludeFoldersFromProjects.join(", "))
          .onChange(async (value) => {
            const folders = value
              .split(",")
              .map(f => f.trim())
              .filter(f => f.length > 0);

            this.plugin.settings.excludeFoldersFromProjects = folders;

            this.plugin.projectManager = new ProjectManager(
              this.app,
              this.plugin.scanner,
              this.plugin.settings.defaultProjectsFolder,
              this.plugin.settings.priorityTags,
              folders
            );

            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Projects base folder")
      .setDesc("Folder of git repos scanned for project notes (e.g., /Users/you/projects). Leave blank to disable repo syncing.")
      .addText((text) =>
        text
          .setPlaceholder("/Users/you/projects")
          .setValue(this.plugin.settings.projectsBaseFolder)
          .onChange(async (value) => {
            this.plugin.settings.projectsBaseFolder = value;
            await this.plugin.saveSettings();
            if (value) {
              this.plugin.projectSyncManager.startWatching(this.plugin.projectsSyncOptions());
            } else {
              this.plugin.projectSyncManager.stopWatching();
            }
          })
      );

    new Setting(containerEl)
      .setName("Projects exclude directories")
      .setDesc("Comma-separated directory names to skip while scanning for repos (e.g., node_modules, dist, build, archive)")
      .addText((text) =>
        text
          .setPlaceholder("node_modules, dist, build, archive")
          .setValue(this.plugin.settings.projectsExcludeDirs.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.projectsExcludeDirs = value
              .split(",")
              .map((d) => d.trim())
              .filter((d) => d.length > 0);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Projects scan depth")
      .setDesc("How many folder levels deep to look for repos under the base folder")
      .addText((text) =>
        text
          .setPlaceholder("3")
          .setValue(String(this.plugin.settings.projectsScanDepth))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.projectsScanDepth = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // Focus Mode section
    containerEl.createEl("h3", { text: "Focus Mode" });

    new Setting(containerEl)
      .setName("Focus queue limit")
      .setDesc("How many items to show at once in Focus Mode (1–5). 1 means strict single-task focus.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 5, 1)
          .setValue(this.plugin.settings.focusQueueLimit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.focusQueueLimit = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Persist focus mode across sessions")
      .setDesc("When on, Focus Mode stays active after closing and reopening Obsidian.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.focusModePersist)
          .onChange(async (value) => {
            this.plugin.settings.focusModePersist = value;
            await this.plugin.saveSettings();
          })
      );

    // Team section
    containerEl.createEl("h3", { text: "Team" });

    new Setting(containerEl)
      .setName("Team file path")
      .setDesc("Path to the team definition file in your vault")
      .addText((text) =>
        text
          .setPlaceholder("team.md")
          .setValue(this.plugin.settings.teamFilePath)
          .onChange(async (value) => {
            this.plugin.settings.teamFilePath = value;
            this.plugin.teamManager.setFilePath(value);
            await this.plugin.saveSettings();
            this.display();
          })
      );

    const teamFile = this.app.vault.getAbstractFileByPath(this.plugin.settings.teamFilePath);
    const teamButtonSetting = new Setting(containerEl);

    if (teamFile instanceof TFile) {
      teamButtonSetting
        .setName("Manage team file")
        .addButton((btn) =>
          btn.setButtonText("Open team file").onClick(async () => {
            await this.app.workspace.getLeaf(false).openFile(teamFile);
          })
        );
    } else {
      teamButtonSetting
        .setName("No team file found")
        .setDesc("Create a starter team file with your username")
        .addButton((btn) =>
          btn.setButtonText("Create team file").setCta().onClick(async () => {
            const file = await this.plugin.teamManager.createTeamFile();
            await this.app.workspace.getLeaf(false).openFile(file);
            this.display();
          })
        );
    }

    const team = this.plugin.teamManager.getTeam();
    if (team.length > 0) {
      const teamList = containerEl.createEl("div", { cls: "sc-team-list" });
      for (const member of team) {
        const entry = teamList.createEl("div", { cls: "sc-team-entry" });
        entry.createEl("span", { cls: "sc-team-handle", text: `@${member.handle}` });
        entry.createEl("span", { cls: "sc-team-name", text: member.name });
        if (member.isMe) {
          entry.createEl("span", { cls: "sc-team-me-badge", text: "(me)" });
        }
      }

      new Setting(containerEl)
        .setName("Default assignee")
        .setDesc("Unattributed tasks are treated as belonging to this person when filtering")
        .addDropdown((dropdown) => {
          dropdown.addOption("", "None");
          dropdown.addOption("me", "@me");
          for (const member of team) {
            if (!member.isMe) {
              dropdown.addOption(member.handle, `@${member.handle}`);
            }
          }
          dropdown.setValue(this.plugin.settings.defaultAssignee);
          dropdown.onChange(async (value) => {
            this.plugin.settings.defaultAssignee = value;
            await this.plugin.saveSettings();
          });
        });
    }

  }
}
