import { Plugin, PluginSettingTab, App, Setting, Notice } from "obsidian";
import { ClickUpSettings, DEFAULT_SETTINGS } from "./src/types";

export default class ClickUpHelpersPlugin extends Plugin {
  settings: ClickUpSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ClickUpSettingsTab(this.app, this));
    console.log("ClickUp Helpers loaded");
  }

  onunload() {
    console.log("ClickUp Helpers unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ClickUpSettingsTab extends PluginSettingTab {
  plugin: ClickUpHelpersPlugin;

  constructor(app: App, plugin: ClickUpHelpersPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "ClickUp Helpers" });

    new Setting(containerEl)
      .setName("API token")
      .setDesc("Your ClickUp personal API token.")
      .addText((text) =>
        text
          .setPlaceholder("pk_...")
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            this.plugin.settings.apiToken = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("p", {
      text: "Additional settings (workspace, lists, LLM) will appear here in Phase 2.",
      cls: "setting-item-description",
    });
  }
}
