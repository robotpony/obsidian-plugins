import {
  App,
  Notice,
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
} from "./src/types";
import { convertToSlackMarkdown } from "./src/SlackConverter";
import { LOGO_PREFIX } from "./src/utils";

export default class SpaceCommandPlugin extends Plugin {
  settings: SpaceCommandSettings;
  scanner: TodoScanner;
  processor: TodoProcessor;
  projectManager: ProjectManager;
  embedRenderer: EmbedRenderer;

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
      this.settings.priorityTags
    );
    this.embedRenderer = new EmbedRenderer(
      this.app,
      this.scanner,
      this.processor,
      this.projectManager,
      this.settings.defaultTodoneFile,
      this.settings.focusListLimit,
      this.settings.priorityTags
    );

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
          this.settings.recentTodonesLimit
        )
    );

    // Show sidebar by default if setting is enabled
    if (this.settings.showSidebarByDefault) {
      this.activateSidebar();
    }

    // Register markdown post processor for {{focus-todos}} and {{focus-list}} syntax
    this.registerMarkdownPostProcessor((el, ctx) => {
      const codeBlocks = el.findAll("p, div");
      for (const block of codeBlocks) {
        const text = block.textContent || "";
        if (text.includes("{{focus-todos")) {
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
          new Notice(`${LOGO_PREFIX} No text selected`);
          return;
        }
        const slackMd = convertToSlackMarkdown(selection);
        await navigator.clipboard.writeText(slackMd);
        new Notice(`${LOGO_PREFIX} Copied as Slack markdown`);
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "c",
        },
      ],
    });

    // Editor context menu: Copy as Slack
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
                new Notice(`${LOGO_PREFIX} Copied as Slack markdown`);
              });
          });
        }
      })
    );

    // Add ribbon icon
    this.addRibbonIcon("checkbox-glyph", "Toggle TODO Sidebar", () => {
      this.toggleSidebar();
    });

    // Add settings tab
    this.addSettingTab(new SpaceCommandSettingTab(this.app, this));
  }

  onunload() {
    // Detach all sidebar views
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TODO_SIDEBAR);
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

    containerEl.createEl("h2", { text: "␣⌘ Space Command Settings" });

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

    containerEl.createEl("h3", { text: "Projects Settings" });

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
      .setDesc("Maximum number of projects to show in {{focus-list}}")
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
              tags
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
  }
}
