import {
  App,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
} from "obsidian";
import { TodoScanner } from "./src/TodoScanner";
import { TodoProcessor } from "./src/TodoProcessor";
import { ProjectManager } from "./src/ProjectManager";
import { EmbedRenderer } from "./src/EmbedRenderer";
import { CodeBlockProcessor } from "./src/CodeBlockProcessor";
import { SlashCommandSuggest } from "./src/SlashCommandSuggest";
import { DateSuggest } from "./src/DateSuggest";
import {
  TodoSidebarView,
  VIEW_TYPE_TODO_SIDEBAR,
} from "./src/SidebarView";
import {
  SpaceCommandSettings,
  DEFAULT_SETTINGS,
  TodoItem,
} from "./src/types";
import { convertToSlackMarkdown } from "./src/SlackConverter";
import { showNotice } from "./src/utils";
import { LLMClient } from "./src/LLMClient";
import { DefineTooltip } from "./src/DefineTooltip";
import { TabLockManager } from "./src/TabLockManager";
import { createHeaderSortPlugin } from "./src/HeaderSortExtension";

export default class SpaceCommandPlugin extends Plugin {
  settings: SpaceCommandSettings;
  scanner: TodoScanner;
  processor: TodoProcessor;
  projectManager: ProjectManager;
  embedRenderer: EmbedRenderer;
  llmClient: LLMClient;
  defineTooltip: DefineTooltip;
  tabLockManager: TabLockManager;

  async onload() {
    await this.loadSettings();

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
    this.embedRenderer = new EmbedRenderer(
      this.app,
      this.scanner,
      this.processor,
      this.projectManager,
      this.settings.defaultTodoneFile,
      this.settings.focusListLimit,
      this.settings.priorityTags,
      this.settings.makeLinksClickable
    );

    // Initialize LLM client for Define/Rewrite/Review features
    this.llmClient = new LLMClient({
      url: this.settings.llmUrl,
      model: this.settings.llmModel,
      prompt: this.settings.llmPrompt,
      rewritePrompt: this.settings.llmRewritePrompt,
      reviewPrompt: this.settings.llmReviewPrompt,
      timeout: this.settings.llmTimeout,
    });
    this.defineTooltip = new DefineTooltip(this.app);

    // Initialize tab lock manager
    this.tabLockManager = new TabLockManager(this.app);

    // Enable tab lock buttons if setting is enabled
    if (this.settings.showTabLockButton) {
      this.app.workspace.onLayoutReady(() => {
        this.tabLockManager.enable();
      });
    }

    // Configure scanner to exclude TODONE log file from Recent TODONEs
    if (this.settings.excludeTodoneFilesFromRecent) {
      this.scanner.setExcludeFromTodones([this.settings.defaultTodoneFile]);
    }

    // Set up processor callback to trigger re-scan after completion
    this.processor.setOnCompleteCallback(() => {
      // File will be modified, which will trigger scanner's file watcher
      // But we can also refresh the workspace to update embeds
      this.app.workspace.trigger("markdown-changed");
    });

    // Scan vault on load
    await this.scanner.scanVault();

    // Watch for file changes
    this.scanner.watchFiles();

    // Register editor extension for header sort buttons
    this.registerEditorExtension(
      createHeaderSortPlugin(this.app, this.processor, this.scanner)
    );

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
          this.settings.recentTodonesLimit,
          this.settings.activeTodosLimit,
          this.settings.focusListLimit,
          this.settings.focusModeIncludeProjects,
          this.settings.makeLinksClickable,
          this.settings.triageSnoozedThreshold,
          this.settings.triageActiveThreshold,
          () => this.showAboutModal(),
          () => this.showStatsModal(),
          () => this.showTriageModal()
        )
    );

    // Show sidebar by default if setting is enabled
    // Wait for workspace layout to be ready to avoid null reference errors
    if (this.settings.showSidebarByDefault) {
      this.app.workspace.onLayoutReady(() => {
        this.activateSidebar();
      });
    }

    // Register markdown post processor for {{focus-todos}}, {{focus-ideas}}, and {{focus-list}} syntax
    this.registerMarkdownPostProcessor((el, ctx) => {
      const codeBlocks = el.findAll("p, div");
      for (const block of codeBlocks) {
        const text = block.textContent || "";
        if (text.includes("{{focus-todos")) {
          this.embedRenderer.render(text, block);
        } else if (text.includes("{{focus-ideas")) {
          this.embedRenderer.render(text, block);
        } else if (text.includes("{{focus-list}}")) {
          this.embedRenderer.render(text, block);
        }
      }
    });

    // Register code block processors for focus-todos and focus-list
    // These work in BOTH Reading Mode AND Live Preview mode
    const codeBlockProcessor = new CodeBlockProcessor(
      this.embedRenderer,
      this.settings.defaultTodoneFile
    );
    codeBlockProcessor.registerProcessors(this);

    // Register editor suggesters for slash commands and @date
    this.registerEditorSuggest(new SlashCommandSuggest(this.app, this.settings));
    this.registerEditorSuggest(new DateSuggest(this.app, this.settings));

    // Commands
    this.addCommand({
      id: "toggle-todo-sidebar",
      name: "Toggle TODO Sidebar",
      callback: () => {
        this.toggleSidebar();
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
        this.refreshSidebar();
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

    // Editor context menu: Copy as Slack and Define
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

          // Define menu item (LLM lookup)
          if (this.settings.llmEnabled) {
            menu.addItem((item) => {
              item
                .setTitle("Define term...")
                .setIcon("book-open")
                .onClick(async () => {
                  // Show loading tooltip with the selected term
                  this.defineTooltip.show(editor, "", true, selection, {
                    loadingText: "Defining...",
                    commandType: "define",
                  });

                  // Request definition from LLM
                  const result = await this.llmClient.define(selection);

                  if (result.success && result.definition) {
                    this.defineTooltip.updateContent(result.definition);
                  } else {
                    this.defineTooltip.showError(
                      this.llmClient.getModel(),
                      () => this.openLLMSettings()
                    );
                  }
                });
            });

            // Review menu item (LLM suggestions)
            menu.addItem((item) => {
              item
                .setTitle("Review...")
                .setIcon("message-square")
                .onClick(async () => {
                  // Show loading tooltip
                  this.defineTooltip.show(editor, "", true, "", {
                    loadingText: "Reviewing...",
                    commandType: "review",
                    showApply: true,
                  });

                  // Request review from LLM
                  const result = await this.llmClient.review(selection);

                  if (result.success && result.result) {
                    this.defineTooltip.updateContent(result.result, {
                      showApply: true,
                    });
                  } else {
                    this.defineTooltip.showError(
                      this.llmClient.getModel(),
                      () => this.openLLMSettings()
                    );
                  }
                });
            });

            // Rewrite menu item (LLM rewrite for clarity/brevity)
            menu.addItem((item) => {
              item
                .setTitle("Rewrite...")
                .setIcon("pencil")
                .onClick(async () => {
                  // Store the current selection range for Apply
                  const from = editor.getCursor("from");
                  const to = editor.getCursor("to");

                  // Show loading tooltip
                  this.defineTooltip.show(editor, "", true, "", {
                    loadingText: "Rewriting...",
                    commandType: "rewrite",
                    onApply: (content: string) => {
                      // Replace the original selection with the rewritten content
                      editor.replaceRange(content, from, to);
                      showNotice("Text replaced");
                    },
                  });

                  // Request rewrite from LLM
                  const result = await this.llmClient.rewrite(selection);

                  if (result.success && result.result) {
                    this.defineTooltip.updateContent(result.result, {
                      onApply: (content: string) => {
                        editor.replaceRange(content, from, to);
                        showNotice("Text replaced");
                      },
                    });
                  } else {
                    this.defineTooltip.showError(
                      this.llmClient.getModel(),
                      () => this.openLLMSettings()
                    );
                  }
                });
            });
          }
        }
      })
    );

    // Add ribbon icon
    this.addRibbonIcon("square-check-big", "Toggle TODO Sidebar", () => {
      this.toggleSidebar();
    });

    // Add settings tab
    this.addSettingTab(new SpaceCommandSettingTab(this.app, this));
  }

  onunload() {
    // Detach all sidebar views
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TODO_SIDEBAR);
    // Clean up define tooltip
    this.defineTooltip.close();
    // Clean up tab lock manager
    this.tabLockManager.destroy();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateSidebar() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_TODO_SIDEBAR);

    if (leaves.length > 0) {
      // Sidebar already exists
      leaf = leaves[0];
    } else {
      // Create new sidebar
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({
          type: VIEW_TYPE_TODO_SIDEBAR,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async toggleSidebar() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_TODO_SIDEBAR);

    if (leaves.length > 0) {
      // Close sidebar
      leaves.forEach((leaf) => leaf.detach());
    } else {
      // Open sidebar
      await this.activateSidebar();
    }
  }

  refreshSidebar() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_TODO_SIDEBAR);

    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof TodoSidebarView) {
        view.render();
      }
    }
  }

  showAboutModal() {
    new AboutModal(this.app, this.manifest.version).open();
  }

  showStatsModal() {
    new StatsModal(this.app, this.scanner).open();
  }

  showTriageModal() {
    new TriageModal(this.app, this.scanner, this.processor, this.embedRenderer, this.settings.defaultTodoneFile).open();
  }

  openLLMSettings() {
    // Open Obsidian settings and navigate to Space Command tab
    (this.app as any).setting.open();
    (this.app as any).setting.openTabById("space-command");
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
    contentEl.addClass("space-command-about-modal");

    // Logo and title
    const header = contentEl.createEl("div", { cls: "about-header" });
    header.createEl("span", { cls: "space-command-logo about-logo", text: "␣⌘" });
    header.createEl("h2", { text: "Space Command" });

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
    contentEl.addClass("space-command-stats-modal");

    // Header
    const header = contentEl.createEl("div", { cls: "stats-header" });
    header.createEl("span", { cls: "space-command-logo stats-logo", text: "␣⌘" });
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

// Triage modal for quickly processing TODOs and Ideas
class TriageModal extends Modal {
  private scanner: TodoScanner;
  private processor: TodoProcessor;
  private embedRenderer: EmbedRenderer;
  private defaultTodoneFile: string;
  private items: TodoItem[] = [];
  private currentIndex: number = 0;

  constructor(app: App, scanner: TodoScanner, processor: TodoProcessor, embedRenderer: EmbedRenderer, defaultTodoneFile: string) {
    super(app);
    this.scanner = scanner;
    this.processor = processor;
    this.embedRenderer = embedRenderer;
    this.defaultTodoneFile = defaultTodoneFile;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("space-command-triage-modal");

    // Gather items for triage in priority order:
    // 1. Active TODOs (non-snoozed)
    // 2. Active Ideas (non-snoozed)
    // 3. Snoozed items (TODOs then Ideas)
    const todos = this.scanner.getTodos();
    const ideas = this.scanner.getIdeas();

    // Skip header items - they represent groups of subtasks and shouldn't be triaged individually
    const activeTodos = todos.filter(t =>
      !t.isHeader &&
      !t.tags.includes("#future") &&
      !t.tags.includes("#snooze") &&
      !t.tags.includes("#snoozed") &&
      !t.tags.includes("#idea") &&
      !t.tags.includes("#ideas") &&
      !t.tags.includes("#ideation") &&
      !t.tags.includes("#focus") // Skip already focused
    );

    const activeIdeas = ideas.filter(i =>
      !i.isHeader &&
      !i.tags.includes("#future") &&
      !i.tags.includes("#snooze") &&
      !i.tags.includes("#snoozed") &&
      !i.tags.includes("#focus") // Skip already focused
    );

    const snoozedTodos = todos.filter(t =>
      !t.isHeader &&
      (t.tags.includes("#future") ||
       t.tags.includes("#snooze") ||
       t.tags.includes("#snoozed")) &&
      !t.tags.includes("#idea") &&
      !t.tags.includes("#ideas") &&
      !t.tags.includes("#ideation")
    );

    const snoozedIdeas = ideas.filter(i =>
      !i.isHeader &&
      (i.tags.includes("#future") ||
       i.tags.includes("#snooze") ||
       i.tags.includes("#snoozed"))
    );

    // Combine in order: active TODOs, active Ideas, snoozed TODOs, snoozed Ideas
    this.items = [...activeTodos, ...activeIdeas, ...snoozedTodos, ...snoozedIdeas];
    this.currentIndex = 0;

    this.renderCurrentItem();
  }

  private renderCurrentItem(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Header row: logo + title on left, progress on right
    const header = contentEl.createEl("div", { cls: "triage-header" });
    const titleGroup = header.createEl("div", { cls: "triage-title-group" });
    titleGroup.createEl("span", { cls: "space-command-logo", text: "␣⌘" });

    // Progress indicator (top-right)
    const progress = header.createEl("div", { cls: "triage-progress" });
    progress.appendText(`${this.currentIndex + 1} of ${this.items.length}`);

    if (this.items.length === 0 || this.currentIndex >= this.items.length) {
      // Done triaging - show generic title
      const titleEl = titleGroup.createEl("span", { cls: "triage-title" });
      titleEl.appendText("Triage your ");
      titleEl.createEl("em", { text: "tasks" });

      const doneEl = contentEl.createEl("div", { cls: "triage-done" });
      doneEl.createEl("p", { text: "All items triaged!", cls: "triage-done-text" });
      const closeBtn = doneEl.createEl("button", { text: "Close", cls: "triage-btn triage-btn-close" });
      closeBtn.addEventListener("click", () => this.close());
      return;
    }

    const item = this.items[this.currentIndex];

    // Determine item type for title and button logic
    const isSnoozed = item.tags.includes("#future") || item.tags.includes("#snooze") || item.tags.includes("#snoozed");
    const isIdea = item.itemType === 'idea' || item.tags.includes("#idea") || item.tags.includes("#ideas");

    // Dynamic title based on item type
    const titleEl = titleGroup.createEl("span", { cls: "triage-title" });
    titleEl.appendText("Triage your ");
    if (isSnoozed) {
      titleEl.createEl("em", { text: "snoozed items" });
    } else if (isIdea) {
      titleEl.createEl("em", { text: "ideas" });
    } else {
      titleEl.createEl("em", { text: "tasks" });
    }

    // Show parent header text if item has one, otherwise leave blank
    const contextIndicator = contentEl.createEl("div", { cls: "triage-context" });
    if (item.parentLineNumber !== undefined) {
      // Look up parent header from scanner
      const allItems = isIdea ? this.scanner.getIdeas() : this.scanner.getTodos();
      const parentHeader = allItems.find(
        t => t.filePath === item.filePath && t.lineNumber === item.parentLineNumber
      );
      if (parentHeader) {
        // Strip tags and heading markers from parent text
        const parentText = parentHeader.text
          .replace(/(?<!\\)#[\w-]+/g, "") // Remove tags including dashes, preserve escaped
          .replace(/\\#/g, "#") // Convert escaped tags back
          .replace(/^#{1,6}\s+/, "")
          .trim();
        contextIndicator.appendText(parentText);
      }
    }

    // Item content with checkbox
    const itemContent = contentEl.createEl("div", { cls: "triage-item-content" });
    const checkbox = itemContent.createEl("input", {
      type: "checkbox",
      cls: "triage-checkbox",
    });
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      if (isIdea) {
        await this.processor.completeIdea(item);
      } else {
        await this.processor.completeTodo(item, this.defaultTodoneFile);
      }
      this.nextItem();
    });

    // Strip tags and list markers, but preserve markdown for rendering
    const textSpan = itemContent.createEl("span", { cls: "triage-item-text" });
    let displayText = item.text
      .replace(/(?<!\\)#[\w-]+/g, "") // Remove tags (including dashes), but preserve escaped \#tags
      .replace(/\\#/g, "#") // Convert escaped tags back to normal
      .replace(/^[-*+]\s*\[.\]\s*/, "") // Remove checkbox
      .replace(/^[-*+]\s*/, "") // Remove list marker
      .replace(/^#{1,6}\s+/, "") // Remove heading markers
      .trim();
    this.embedRenderer.renderInlineMarkdown(displayText, textSpan);

    // Source file + tags on one line (source left, tags right)
    const metaRow = contentEl.createEl("div", { cls: "triage-meta-row" });
    const sourceEl = metaRow.createEl("div", { cls: "triage-source" });
    sourceEl.appendText(`(from ${item.filePath})`);
    const tagsEl = metaRow.createEl("div", { cls: "triage-tags" });
    for (const tag of item.tags) {
      tagsEl.createEl("a", { cls: "tag", href: tag, text: tag });
    }

    // Separator line before actions
    contentEl.createEl("div", { cls: "triage-separator" });

    // Action buttons - Order: Snooze | Clear | → Idea/TODO | Focus | Skip
    const actions = contentEl.createEl("div", { cls: "triage-actions" });

    // Snooze/Unsnooze button
    if (isSnoozed) {
      const unsnoozeBtn = actions.createEl("button", {
        cls: "triage-btn triage-btn-unsnooze",
        attr: { title: "Remove snooze tag and make this item active again" }
      });
      unsnoozeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg> Wake';
      unsnoozeBtn.addEventListener("click", async () => {
        await this.processor.removeTag(item, "#future");
        if (item.tags.includes("#snooze")) await this.processor.removeTag(item, "#snooze");
        if (item.tags.includes("#snoozed")) await this.processor.removeTag(item, "#snoozed");
        this.nextItem();
      });
    } else {
      const snoozeBtn = actions.createEl("button", {
        cls: "triage-btn triage-btn-snooze",
        attr: { title: "Snooze this item for later" }
      });
      snoozeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Snooze';
      snoozeBtn.addEventListener("click", async () => {
        await this.processor.setPriorityTag(item, "#future");
        this.nextItem();
      });
    }

    // Clear button (removes type tag entirely)
    const clearBtn = actions.createEl("button", {
      cls: "triage-btn triage-btn-clear",
      attr: { title: "Remove the type tag (item will no longer appear in lists)" }
    });
    clearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg> Clear';
    clearBtn.addEventListener("click", async () => {
      if (isIdea) {
        await this.processor.removeTag(item, "#idea");
        if (item.tags.includes("#ideas")) await this.processor.removeTag(item, "#ideas");
        if (item.tags.includes("#ideation")) await this.processor.removeTag(item, "#ideation");
      } else {
        await this.processor.removeTag(item, "#todo");
      }
      this.nextItem();
    });

    // Convert button (TODO ↔ Idea)
    if (isIdea) {
      const toTodoBtn = actions.createEl("button", {
        cls: "triage-btn triage-btn-convert",
        attr: { title: "Convert this Idea to a TODO" }
      });
      toTodoBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5"/><path d="m9 11 3 3L22 4"/></svg> → TODO';
      toTodoBtn.addEventListener("click", async () => {
        // Remove idea tags, add todo
        await this.processor.removeTag(item, "#idea");
        if (item.tags.includes("#ideas")) await this.processor.removeTag(item, "#ideas");
        if (item.tags.includes("#ideation")) await this.processor.removeTag(item, "#ideation");
        await this.processor.addTag(item, "#todo");
        this.nextItem();
      });
    } else {
      const toIdeaBtn = actions.createEl("button", {
        cls: "triage-btn triage-btn-convert",
        attr: { title: "Convert this TODO to an Idea" }
      });
      toIdeaBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg> → Idea';
      toIdeaBtn.addEventListener("click", async () => {
        // Remove todo tag, add idea
        await this.processor.removeTag(item, "#todo");
        await this.processor.addTag(item, "#idea");
        this.nextItem();
      });
    }

    // Focus button
    const focusBtn = actions.createEl("button", {
      cls: "triage-btn triage-btn-focus",
      attr: { title: "Add #focus tag to prioritize this item" }
    });
    focusBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> Focus';
    focusBtn.addEventListener("click", async () => {
      await this.processor.setPriorityTag(item, "#focus");
      this.nextItem();
    });

    // Back button (skip-back icon, no text)
    const backBtn = actions.createEl("button", {
      cls: "triage-btn triage-btn-back",
      attr: { title: "Go back to previous item" }
    });
    backBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="5" x2="5" y2="19"/><polygon points="19 4 9 12 19 20 19 4"/></svg>';
    backBtn.addEventListener("click", () => this.prevItem());
    // Disable if at first item
    if (this.currentIndex === 0) {
      backBtn.disabled = true;
      backBtn.classList.add("triage-btn-disabled");
    }

    // Skip button (skip-forward icon)
    const skipBtn = actions.createEl("button", {
      cls: "triage-btn triage-btn-skip",
      attr: { title: "Skip this item and move to next" }
    });
    skipBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg> Skip';
    skipBtn.addEventListener("click", () => this.nextItem());
  }

  private prevItem(): void {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderCurrentItem();
    }
  }

  private nextItem(): void {
    this.currentIndex++;
    this.renderCurrentItem();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class SpaceCommandSettingTab extends PluginSettingTab {
  plugin: SpaceCommandPlugin;

  constructor(app: App, plugin: SpaceCommandPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Space Command Settings" });

    // About section
    const aboutSection = containerEl.createEl("div", { cls: "space-command-about-section" });
    const aboutHeader = aboutSection.createEl("div", { cls: "about-header" });
    aboutHeader.createEl("span", { cls: "space-command-logo about-logo", text: "␣⌘" });
    aboutHeader.createEl("span", { cls: "about-title", text: "Space Command" });

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
      .setDesc("Render wiki links and markdown links as clickable in sidebar and embeds. When disabled, links display as plain text without markdown syntax.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.makeLinksClickable)
          .onChange(async (value) => {
            this.plugin.settings.makeLinksClickable = value;
            await this.plugin.saveSettings();
            // Refresh sidebar and embeds to apply the change
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
      .setDesc("Format for completion dates (using moment.js format)")
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
      .setDesc("Folder where project files are created (e.g., projects/)")
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
      .setName("Focus list limit")
      .setDesc("Maximum number of projects to show in sidebar and {{focus-list}}")
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
      .setName("Focus mode includes project TODOs")
      .setDesc("When enabled, focus mode shows all TODOs from focused projects (not just #focus items)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.focusModeIncludeProjects)
          .onChange(async (value) => {
            this.plugin.settings.focusModeIncludeProjects = value;
            await this.plugin.saveSettings();
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

            // Update ProjectManager with new exclude folders
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

    containerEl.createEl("h3", { text: "Priority Settings" });

    new Setting(containerEl)
      .setName("Priority tags")
      .setDesc("Comma-separated list of priority tags (e.g., #p0, #p1, #p2, #p3, #p4). These tags won't appear in the Projects list.")
      .addText((text) =>
        text
          .setPlaceholder("#p0, #p1, #p2, #p3, #p4")
          .setValue(this.plugin.settings.priorityTags.join(", "))
          .onChange(async (value) => {
            // Parse comma-separated tags
            const tags = value
              .split(",")
              .map(tag => tag.trim())
              .filter(tag => tag.length > 0)
              .map(tag => tag.startsWith("#") ? tag : `#${tag}`);

            this.plugin.settings.priorityTags = tags;

            // Update ProjectManager with new priority tags
            this.plugin.projectManager = new ProjectManager(
              this.app,
              this.plugin.scanner,
              this.plugin.settings.defaultProjectsFolder,
              tags,
              this.plugin.settings.excludeFoldersFromProjects
            );

            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Recent TODONEs limit")
      .setDesc("Maximum number of recent TODONEs to show in sidebar")
      .addText((text) =>
        text
          .setPlaceholder("5")
          .setValue(String(this.plugin.settings.recentTodonesLimit))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.recentTodonesLimit = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // Triage Settings
    containerEl.createEl("h3", { text: "Triage" });

    new Setting(containerEl)
      .setName("Snoozed items threshold")
      .setDesc("Show triage alert when snoozed items exceed this count")
      .addText((text) =>
        text
          .setPlaceholder("10")
          .setValue(String(this.plugin.settings.triageSnoozedThreshold))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.triageSnoozedThreshold = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Active items threshold")
      .setDesc("Show triage alert when active TODOs + Ideas exceed this count")
      .addText((text) =>
        text
          .setPlaceholder("20")
          .setValue(String(this.plugin.settings.triageActiveThreshold))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.triageActiveThreshold = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // LLM/Define/Rewrite/Review Settings
    containerEl.createEl("h3", { text: "LLM Settings (Define, Rewrite, Review)" });

    new Setting(containerEl)
      .setName("Enable Define feature")
      .setDesc("Show 'Define' option in context menu to look up definitions via LLM")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.llmEnabled)
          .onChange(async (value) => {
            this.plugin.settings.llmEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("LLM URL")
      .setDesc("Ollama server URL (default: http://localhost:11434)")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:11434")
          .setValue(this.plugin.settings.llmUrl)
          .onChange(async (value) => {
            this.plugin.settings.llmUrl = value;
            this.plugin.llmClient.updateConfig({ url: value });
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("LLM Model")
      .setDesc("Model name to use (e.g., llama3.2, mistral, codellama)")
      .addText((text) =>
        text
          .setPlaceholder("llama3.2")
          .setValue(this.plugin.settings.llmModel)
          .onChange(async (value) => {
            this.plugin.settings.llmModel = value;
            this.plugin.llmClient.updateConfig({ model: value });
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Definition prompt")
      .setDesc("Prompt prepended to the selected text for Define")
      .addTextArea((text) => {
        text
          .setPlaceholder("Explain what this means...")
          .setValue(this.plugin.settings.llmPrompt)
          .onChange(async (value) => {
            this.plugin.settings.llmPrompt = value;
            this.plugin.llmClient.updateConfig({ prompt: value });
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.style.width = "100%";
      });

    new Setting(containerEl)
      .setName("Rewrite prompt")
      .setDesc("Prompt prepended to the selected text for Rewrite")
      .addTextArea((text) => {
        text
          .setPlaceholder("Rewrite for clarity and brevity...")
          .setValue(this.plugin.settings.llmRewritePrompt)
          .onChange(async (value) => {
            this.plugin.settings.llmRewritePrompt = value;
            this.plugin.llmClient.updateConfig({ rewritePrompt: value });
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.style.width = "100%";
      });

    new Setting(containerEl)
      .setName("Review prompt")
      .setDesc("Prompt prepended to the selected text for Review")
      .addTextArea((text) => {
        text
          .setPlaceholder("Review and suggest improvements...")
          .setValue(this.plugin.settings.llmReviewPrompt)
          .onChange(async (value) => {
            this.plugin.settings.llmReviewPrompt = value;
            this.plugin.llmClient.updateConfig({ reviewPrompt: value });
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.style.width = "100%";
      });

    new Setting(containerEl)
      .setName("Timeout (ms)")
      .setDesc("Maximum time to wait for LLM response")
      .addText((text) =>
        text
          .setPlaceholder("30000")
          .setValue(String(this.plugin.settings.llmTimeout))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.llmTimeout = num;
              this.plugin.llmClient.updateConfig({ timeout: num });
              await this.plugin.saveSettings();
            }
          })
      );
  }
}
