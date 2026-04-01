import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { GCommandSettings, DEFAULT_SETTINGS } from "./src/types";
import { GDriveSidebar, VIEW_TYPE_GDRIVE_SIDEBAR } from "./src/GDriveSidebar";
import { DriveProvider } from "./src/DriveProvider";
import { SidebarManager } from "../shared";

export default class GCommandPlugin extends Plugin {
  settings: GCommandSettings;
  private drive: DriveProvider;
  private sidebarManager: SidebarManager;

  async onload() {
    await this.loadSettings();

    this.drive = new DriveProvider(this.settings.rcloneRemote);
    this.sidebarManager = new SidebarManager(this.app, VIEW_TYPE_GDRIVE_SIDEBAR);

    const pluginDir = this.manifest.dir ?? "";

    this.registerView(
      VIEW_TYPE_GDRIVE_SIDEBAR,
      (leaf) =>
        new GDriveSidebar(
          leaf,
          this.drive,
          this.settings,
          () => this.openSettings(),
          pluginDir
        )
    );

    this.app.workspace.onLayoutReady(() => {
      this.sidebarManager.activate();
    });

    this.addCommand({
      id: "open-drive-browser",
      name: "Open Drive browser",
      callback: () => this.sidebarManager.toggle(),
    });

    this.addRibbonIcon("hard-drive", "Google Drive", () => {
      this.sidebarManager.toggle();
    });

    this.addSettingTab(new GCommandSettingTab(this.app, this));
  }

  onunload() {}

  private openSettings(): void {
    // Open the Obsidian settings pane and navigate to this plugin's tab
    const setting = (this.app as any).setting;
    if (setting) {
      setting.open();
      setting.openTabById("g-command");
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class GCommandSettingTab extends PluginSettingTab {
  plugin: GCommandPlugin;

  constructor(app: App, plugin: GCommandPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("rclone remote")
      .setDesc(
        "Name of the rclone remote configured for Google Drive. " +
        "Must match the name used in rclone config (run setup.sh to configure)."
      )
      .addText((text) =>
        text
          .setPlaceholder("gdrive")
          .setValue(this.plugin.settings.rcloneRemote)
          .onChange(async (value) => {
            this.plugin.settings.rcloneRemote = value.trim() || "gdrive";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Vault sync root")
      .setDesc(
        "Folder in this vault where synced Drive files will be written. " +
        "Drive folder structure is mirrored inside it."
      )
      .addText((text) =>
        text
          .setPlaceholder("gdrive")
          .setValue(this.plugin.settings.vaultRoot)
          .onChange(async (value) => {
            this.plugin.settings.vaultRoot = value.trim() || "gdrive";
            await this.plugin.saveSettings();
          })
      );
  }
}
