import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { GCommandSettings, DEFAULT_SETTINGS } from "./src/types";

export default class GCommandPlugin extends Plugin {
  settings: GCommandSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new GCommandSettingTab(this.app, this));
  }

  onunload() {}

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
