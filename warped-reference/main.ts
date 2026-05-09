import { App, debounce, Plugin, PluginSettingTab, Setting } from "obsidian";
import { GCommandSettings, DEFAULT_SETTINGS } from "./src/types";
import { GDriveSidebar, VIEW_TYPE_GDRIVE_SIDEBAR } from "./src/GDriveSidebar";
import { DriveProvider, DriveError, getRcloneInstallInstructions } from "./src/DriveProvider";
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

    // Invalidate sync state when a synced file is deleted from the vault
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        const drivePath = Object.keys(this.settings.syncState).find(
          (k) => this.settings.syncState[k].vaultPath === file.path
        );
        if (!drivePath) return;

        delete this.settings.syncState[drivePath];

        const idx = this.settings.selectedPaths.indexOf(drivePath);
        if (idx !== -1) this.settings.selectedPaths.splice(idx, 1);

        this.saveSettings();
        this.sidebarManager.refresh();
      })
    );
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

type ConnectionStatus = "idle" | "checking" | "connecting" | "connected" | "error" | "binary-missing";

class GCommandSettingTab extends PluginSettingTab {
  plugin: GCommandPlugin;
  private debouncedUpdateRemote: ReturnType<typeof debounce>;
  private connectionStatus: ConnectionStatus = "idle";
  private connectionError = "";
  private hasChecked = false;

  constructor(app: App, plugin: GCommandPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.debouncedUpdateRemote = debounce(() => this.plugin.updateRemote(), 500, true);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // --- Connection status ---
    this.renderConnectionStatus(containerEl);

    // --- Settings fields ---

    new Setting(containerEl)
      .setName("rclone remote")
      .setDesc("Name of the rclone remote for Google Drive. Default: gdrive.")
      .addText((text) =>
        text
          .setPlaceholder("gdrive")
          .setValue(this.plugin.settings.rcloneRemote)
          .onChange(async (value) => {
            this.plugin.settings.rcloneRemote = value.trim() || "gdrive";
            await this.plugin.saveSettings();
            this.debouncedUpdateRemote();
            this.connectionStatus = "idle";
            this.hasChecked = false;
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
            this.connectionStatus = "idle";
            this.hasChecked = false;
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
      )
      .addButton((btn) => btn
          .setButtonText("Show in Finder")
          .onClick(async () => {
            const adapter = this.app.vault.adapter as any;
            const basePath: string = adapter.getBasePath?.() ?? "";
            if (!basePath) return;

            const syncRoot = this.plugin.settings.vaultRoot;
            if (!this.app.vault.getAbstractFileByPath(syncRoot)) {
              await this.app.vault.createFolder(syncRoot);
            }

            const fullPath = `${basePath}/${syncRoot}`;
            const { shell } = require("electron").remote ?? require("electron");
            shell.showItemInFolder(fullPath);
          })
      );

    new Setting(containerEl)
      .setName("Include Drive metadata in frontmatter")
      .setDesc(
        "Add gdrive_id and gdrive_path fields to synced markdown files. " +
        "The synced timestamp is always included."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.frontmatterGdriveFields)
          .onChange(async (value) => {
            this.plugin.settings.frontmatterGdriveFields = value;
            await this.plugin.saveSettings();
          })
      );

    // Check connection on first display
    if (!this.hasChecked) {
      this.checkConnection();
    }
  }

  private renderConnectionStatus(containerEl: HTMLElement): void {
    const setting = new Setting(containerEl).setName("Google Drive");

    switch (this.connectionStatus) {
      case "checking": {
        setting.setDesc("Checking connection...");
        setting.addButton((btn) => btn.setButtonText("Checking...").setDisabled(true));
        break;
      }
      case "connected": {
        const descEl = document.createDocumentFragment();
        const dot = document.createElement("span");
        dot.className = "g-command-connection-dot g-command-connection-dot--connected";
        descEl.appendChild(dot);
        descEl.appendText(" Connected");
        setting.setDesc(descEl as unknown as string);
        break;
      }
      case "connecting": {
        const descEl = document.createDocumentFragment();
        const dot = document.createElement("span");
        dot.className = "g-command-connection-dot g-command-connection-dot--connecting";
        descEl.appendChild(dot);
        descEl.appendText(" Waiting for Google sign-in... Complete the sign-in in your browser.");
        setting.setDesc(descEl as unknown as string);
        setting.addButton((btn) => btn.setButtonText("Connecting...").setDisabled(true));
        break;
      }
      case "error": {
        setting.setDesc(this.connectionError);
        setting.addButton((btn) =>
          btn.setButtonText("Retry").setCta().onClick(() => this.connectDrive())
        );
        break;
      }
      case "binary-missing": {
        const info = getRcloneInstallInstructions();
        const descEl = document.createDocumentFragment();
        descEl.appendText("rclone is required. Install it: ");
        const code = document.createElement("code");
        code.textContent = info.command;
        descEl.appendChild(code);
        descEl.appendText(" ");
        const link = document.createElement("a");
        link.href = info.url;
        link.textContent = "More options";
        descEl.appendChild(link);
        setting.setDesc(descEl as unknown as string);
        setting.addButton((btn) =>
          btn.setButtonText("Check again").onClick(() => {
            this.hasChecked = false;
            this.checkConnection();
          })
        );
        break;
      }
      default: {
        // idle
        setting.setDesc("Not connected to Google Drive");
        setting.addButton((btn) =>
          btn.setButtonText("Connect").setCta().onClick(() => this.connectDrive())
        );
        break;
      }
    }
  }

  private async checkConnection(): Promise<void> {
    this.hasChecked = true;
    this.connectionStatus = "checking";
    this.display();

    try {
      await this.plugin.drive.check();
      this.connectionStatus = "connected";
    } catch (e) {
      if (e instanceof DriveError && e.code === "binary-missing") {
        this.connectionStatus = "binary-missing";
      } else {
        this.connectionStatus = "idle";
      }
    }
    this.display();
  }

  private async connectDrive(): Promise<void> {
    this.connectionStatus = "connecting";
    this.display();

    const result = await this.plugin.drive.setupRemote(this.plugin.settings.rcloneRemote);

    if (result.ok) {
      this.connectionStatus = "connected";
      this.plugin.sidebarManager.refresh();
    } else if (result.code === "binary-missing") {
      this.connectionStatus = "binary-missing";
    } else if (result.code === "timeout") {
      this.connectionStatus = "error";
      this.connectionError = "Sign-in timed out. Click Retry to try again.";
    } else {
      this.connectionStatus = "error";
      this.connectionError = result.message;
    }
    this.display();
  }
}
