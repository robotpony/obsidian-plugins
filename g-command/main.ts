import { App, debounce, Plugin, PluginSettingTab, Setting } from "obsidian";
import { GCommandSettings, DEFAULT_SETTINGS } from "./src/types";
import { GDriveSidebar, VIEW_TYPE_GDRIVE_SIDEBAR } from "./src/GDriveSidebar";
import { DriveProvider } from "./src/DriveProvider";
import { SidebarManager } from "../shared";

export default class GCommandPlugin extends Plugin {
  settings: GCommandSettings;
  drive: DriveProvider;
  sidebarManager: SidebarManager;

  async onload() {
    await this.loadSettings();

    this.drive = new DriveProvider(this.settings.rcloneRemote);
    if (this.settings.rclonePath) {
      this.drive.setPath(this.settings.rclonePath);
    }
    this.sidebarManager = new SidebarManager(this.app, VIEW_TYPE_GDRIVE_SIDEBAR);

    const pluginDir = this.manifest.dir ?? "";

    this.registerView(
      VIEW_TYPE_GDRIVE_SIDEBAR,
      (leaf) =>
        new GDriveSidebar(
          leaf,
          this.app,
          this.drive,
          this.settings,
          () => this.saveSettings(),
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

    this.addCommand({
      id: "sync-drive-files",
      name: "Sync Drive files",
      callback: () => {
        const view = this.sidebarManager.getView() as GDriveSidebar | null;
        if (view) view.resyncAll();
      },
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

  /** Push remote name change to the provider and reload the sidebar. */
  updateRemote(): void {
    this.drive.setRemote(this.settings.rcloneRemote);
    this.sidebarManager.refresh();
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
  private debouncedUpdateRemote: ReturnType<typeof debounce>;

  constructor(app: App, plugin: GCommandPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.debouncedUpdateRemote = debounce(() => this.plugin.updateRemote(), 500, true);
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
            this.debouncedUpdateRemote();
          })
      );

    new Setting(containerEl)
      .setName("rclone path")
      .setDesc(
        "Absolute path to the rclone binary. " +
        "Leave empty to auto-detect (Homebrew, /usr/local/bin, PATH)."
      )
      .addText((text) =>
        text
          .setPlaceholder("auto-detect")
          .setValue(this.plugin.settings.rclonePath)
          .onChange(async (value) => {
            this.plugin.settings.rclonePath = value.trim();
            await this.plugin.saveSettings();
            this.plugin.drive.setPath(this.plugin.settings.rclonePath);
            this.plugin.sidebarManager.refresh();
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
