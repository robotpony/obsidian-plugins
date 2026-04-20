import { App, Plugin, PluginSettingTab, Setting, Notice, WorkspaceLeaf } from "obsidian";
import { DatabaseService } from "./src/DatabaseService";
import { UserDataService } from "./src/UserDataService";
import { LookupService } from "./src/LookupService";
import { ResolutionService } from "./src/ResolutionService";
import { RecipeService } from "./src/RecipeService";
import { NutritionLabel } from "./src/NutritionLabel";
import { LookupView, VIEW_TYPE_LOOKUP } from "./src/LookupView";
import { RecipeView } from "./src/RecipeView";
import { EatWellSettings, DEFAULT_SETTINGS } from "./src/types";
import { SidebarManager, createNoticeFactory } from "../shared";

const LOGO_TEXT = "E⌘";
const PLUGIN_ID = "eat-well";

export default class EatWellPlugin extends Plugin {
  settings: EatWellSettings;
  db: DatabaseService;
  userData: UserDataService;
  lookupSvc: LookupService;
  resolutionSvc: ResolutionService;
  recipeSvc: RecipeService;
  labelRenderer: NutritionLabel;
  sidebarManager: SidebarManager;
  private showNotice: (msg: string, timeout?: number) => void;

  async onload() {
    await this.loadSettings();

    this.showNotice = createNoticeFactory(LOGO_TEXT, `${PLUGIN_ID}-logo`);
    this.sidebarManager = new SidebarManager(this.app, VIEW_TYPE_LOOKUP);

    const pluginDir = this.resolvePluginDir();

    // User data (bundled defaults + user overrides)
    this.userData = new UserDataService(pluginDir);
    this.userData.load();

    // Database
    this.db = new DatabaseService();
    this.db.on("db-error", (msg: string) => {
      new Notice(`Eat Well: ${msg}`, 8000);
    });
    await this.db.init(pluginDir, this.settings.dbPath || undefined);

    // Services
    this.lookupSvc = new LookupService(this.db);
    this.resolutionSvc = new ResolutionService(this.db, this.userData);
    this.recipeSvc = new RecipeService(this.lookupSvc, this.resolutionSvc, this.userData);
    this.labelRenderer = new NutritionLabel(this.lookupSvc);

    // View — each leaf instantiation gets its own RecipeView
    this.registerView(VIEW_TYPE_LOOKUP, (leaf: WorkspaceLeaf) => {
      const recipeView = new RecipeView(
        this.app,
        this.recipeSvc,
        this.labelRenderer,
        this.settings.defaultLang,
      );
      return new LookupView(
        leaf,
        this.lookupSvc,
        this.labelRenderer,
        recipeView,
        this.settings.defaultLang,
        (lang) => {
          this.settings.defaultLang = lang;
          this.saveSettings();
        },
      );
    });

    // Open sidebar on layout ready
    if (this.settings.showSidebarByDefault) {
      this.app.workspace.onLayoutReady(() => this.sidebarManager.activate());
    }

    // Commands
    this.addCommand({
      id: "toggle-sidebar",
      name: "Toggle Sidebar",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "E" }],
      callback: () => this.sidebarManager.toggle(),
    });

    this.addCommand({
      id: "open-lookup",
      name: "Open Lookup",
      callback: () => this.sidebarManager.activate(),
    });

    this.addRibbonIcon("salad", "Eat Well", () => this.sidebarManager.toggle());

    this.addSettingTab(new EatWellSettingTab(this.app, this));
  }

  onunload() {
    this.db?.close();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private resolvePluginDir(): string {
    const adapter = this.app.vault.adapter as { basePath?: string };
    return adapter.basePath
      ? `${adapter.basePath}/.obsidian/plugins/${PLUGIN_ID}`
      : "";
  }
}

// ============================================================
// Settings tab
// ============================================================

class EatWellSettingTab extends PluginSettingTab {
  plugin: EatWellPlugin;

  constructor(app: App, plugin: EatWellPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderAbout(containerEl);

    containerEl.createEl("h3", { text: "Database" });

    new Setting(containerEl)
      .setName("Database path")
      .setDesc("Path to ew.db. Leave blank to use the plugin directory. Restart required.")
      .addText(t => t
        .setPlaceholder("/path/to/work/ew.db")
        .setValue(this.plugin.settings.dbPath)
        .onChange(async v => {
          this.plugin.settings.dbPath = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("DB status")
      .setDesc(
        this.plugin.db.isReady
          ? "Loaded successfully."
          : (this.plugin.db.error ?? "Not loaded.")
      );

    containerEl.createEl("h3", { text: "Sidebar" });

    new Setting(containerEl)
      .setName("Show sidebar on startup")
      .setDesc("Open the Eat Well panel when Obsidian starts.")
      .addToggle(t => t
        .setValue(this.plugin.settings.showSidebarByDefault)
        .onChange(async v => {
          this.plugin.settings.showSidebarByDefault = v;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Display" });

    new Setting(containerEl)
      .setName("Default language")
      .setDesc("French is available for CNF foods only.")
      .addDropdown(d => d
        .addOption("en", "English")
        .addOption("fr", "Français")
        .setValue(this.plugin.settings.defaultLang)
        .onChange(async v => {
          this.plugin.settings.defaultLang = v as "en" | "fr";
          await this.plugin.saveSettings();
          this.plugin.sidebarManager.refresh();
        })
      );

    containerEl.createEl("h3", { text: "Editor" });

    new Setting(containerEl)
      .setName("Enable hover tooltip")
      .setDesc("Show a nutrition summary when hovering over an ingredient line.")
      .addToggle(t => t
        .setValue(this.plugin.settings.enableHoverTooltip)
        .onChange(async v => {
          this.plugin.settings.enableHoverTooltip = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Hover delay (ms)")
      .addText(t => t
        .setValue(String(this.plugin.settings.hoverDelayMs))
        .onChange(async v => {
          const n = parseInt(v);
          if (!isNaN(n) && n >= 0) {
            this.plugin.settings.hoverDelayMs = n;
            await this.plugin.saveSettings();
          }
        })
      );
  }

  private renderAbout(containerEl: HTMLElement): void {
    const section = containerEl.createEl("div", { cls: `${PLUGIN_ID}-about-section` });
    const header = section.createEl("div", { cls: "about-header" });
    header.createEl("span", { cls: `${PLUGIN_ID}-logo about-logo`, text: LOGO_TEXT });
    header.createEl("span", { cls: "about-title", text: "Eat Well" });
    section.createEl("p", {
      cls: "about-version",
      text: `Version ${this.plugin.manifest.version}`,
    });
  }
}

