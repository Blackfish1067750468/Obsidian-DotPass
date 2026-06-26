import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, DOTPASS_SCHEMA_VERSION } from "./defaults";
import { FileExplorerAdapter } from "./fileExplorerAdapter";
import { DotpassSettingTab } from "./settingsTab";
import { DotpassSettings } from "./types";

export default class DotpassPlugin extends Plugin {
  settings: DotpassSettings = { ...DEFAULT_SETTINGS };
  private fileExplorerAdapter: FileExplorerAdapter | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.fileExplorerAdapter = new FileExplorerAdapter(this.app, this);
    this.fileExplorerAdapter.start();

    this.addSettingTab(new DotpassSettingTab(this.app, this));

    this.addCommand({
      id: "export-file-explorer-debug-snapshot",
      name: "Export file explorer debug snapshot",
      callback: async () => {
        try {
          const debugPath = await this.fileExplorerAdapter?.exportDebugSnapshot();
          if (debugPath) {
            const message = `Dotpass debug snapshot written to ${debugPath}`;
            console.log(message);
            new Notice(message, 8000);
          } else {
            const message = "Dotpass exported debug snapshot to console output.";
            console.log(message);
            new Notice(message, 8000);
          }
        } catch (error) {
          const message = `Dotpass debug snapshot failed: ${error instanceof Error ? error.message : String(error)}`;
          console.error(message, error);
          new Notice(message, 12000);
        }
      },
    });

    this.registerEvent(this.app.vault.on("create", () => this.applyRules()));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      void this.handleRename(oldPath, file.path);
    }));
    this.registerEvent(this.app.vault.on("delete", () => this.applyRules()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.applyRules()));
    this.app.workspace.onLayoutReady(() => this.fileExplorerAdapter?.markLayoutReady());
    this.registerEvent(this.app.workspace.on("file-menu", () => this.applyRules()));

  }

  onunload(): void {
    this.fileExplorerAdapter?.stop();
    this.fileExplorerAdapter = null;
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<DotpassSettings> | null;
    this.settings = normalizeSettings(saved);
  }

  async saveSettingsAndApply(): Promise<void> {
    await this.saveData(this.settings);
    this.applyRules();
  }

  async saveSettingsOnly(): Promise<void> {
    await this.saveData(this.settings);
  }

  applyRules(): void {
    this.fileExplorerAdapter?.refreshFileExplorer();
  }

  async rescanHiddenFiles(): Promise<void> {
    await this.fileExplorerAdapter?.syncFileExplorer(true);
  }

  async disableHiddenFiles(): Promise<void> {
    await this.fileExplorerAdapter?.disableHiddenFiles();
  }

  private async handleRename(oldPath: string, newPath: string): Promise<void> {
    let changed = false;

    for (const rule of this.settings.rules) {
      if (!rule.follow?.enabled || !rule.follow.currentPath) continue;

      const currentPath = rule.follow.currentPath;
      const descendantPrefix = `${oldPath}/`;
      const isExact = currentPath === oldPath;
      const isDescendant = currentPath.startsWith(descendantPrefix);
      if (!isExact && !isDescendant) continue;

      const nextPath = isExact ? newPath : `${newPath}/${currentPath.slice(descendantPrefix.length)}`;
      rule.follow.currentPath = nextPath;
      rule.matcher = { type: "path", value: nextPath };
      rule.scope = { type: "global" };
      rule.expression = `path:${nextPath}`;
      rule.updatedAt = Date.now();
      changed = true;
    }

    if (changed) {
      await this.saveData(this.settings);
    }

    this.applyRules();
  }
}

function normalizeSettings(saved: Partial<DotpassSettings> | null): DotpassSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    schemaVersion: saved?.schemaVersion ?? DOTPASS_SCHEMA_VERSION,
    rules: Array.isArray(saved?.rules) ? saved.rules : [],
  };
}
