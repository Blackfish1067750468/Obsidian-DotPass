import * as fs from "fs";
import * as path from "path";
import {
  App,
  FileSystemAdapter,
  Notice,
  Platform,
  TAbstractFile,
  TFile,
  TFolder,
  normalizePath,
  type DataAdapter,
} from "obsidian";
import DotpassPlugin from "./main";
import { createTargetInfo, evaluateVisibility } from "./ruleEngine";

declare module "obsidian" {
  interface Vault {
    getConfig?(key: string): unknown;
    setConfig?(key: string, value: unknown): void;
  }
}

interface RevealAdapter extends DataAdapter {
  files?: Record<string, TAbstractFile>;
  getBasePath?(): string;
  getRealPath?(normalizedPath: string): string;
  reconcileDeletion?: (realPath: string, vaultPath: string, ...args: unknown[]) => unknown;
  reconcileFileInternal?(realPath: string, vaultPath: string): Promise<void>;
  listRecursive?(vaultPath: string): Promise<void>;
}

type FileExplorerLeaf = {
  view?: {
    fileItems?: Record<string, { selfEl?: HTMLElement; el?: HTMLElement }>;
    requestSort?: () => void;
  };
};

const NOTICE_TIMEOUT = 6000;
const ALWAYS_EXCLUDED = new Set([".trash"]);

export class FileExplorerAdapter {
  private readonly app: App;
  private readonly plugin: DotpassPlugin;
  private readonly indexedPaths = new Set<string>();
  private refreshTimer: number | null = null;
  private basePath = "";
  private isScanning = false;
  private layoutReady = false;
  private originalShowUnsupportedFiles: unknown = undefined;
  private originalI18nT: ((...args: unknown[]) => string) | null = null;
  private originalReconcileDeletion: ((realPath: string, vaultPath: string, ...args: unknown[]) => unknown) | null = null;

  constructor(app: App, plugin: DotpassPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  start(): void {
    this.basePath = this.getBasePath();

    if (this.isSupportedDesktopAdapter()) {
      this.rememberAndEnableUnsupportedFiles();
      this.patchAdapter();
      this.suppressDotfileWarning();
    }

    this.applyRulesSoon();
  }

  markLayoutReady(): void {
    this.layoutReady = true;
    if (this.shouldScanHiddenPaths()) {
      void this.enableHiddenFiles(false);
    }
  }

  stop(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    activeDocument.querySelectorAll(".dotpass-hidden").forEach((element) => {
      element.removeClass("dotpass-hidden");
      element.removeAttribute("data-dotpass-action");
    });

    void this.disableHiddenFiles();
  }

  applyRulesSoon(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.applyRules();
    }, 80);
  }

  applyRules(): void {
    activeDocument.querySelectorAll(".dotpass-hidden").forEach((element) => {
      element.removeClass("dotpass-hidden");
      element.removeAttribute("data-dotpass-action");
    });

    if (!this.plugin.settings.enabled) {
      return;
    }

    const files = this.app.vault.getAllLoadedFiles();
    for (const file of files) {
      this.applyRuleToFileItem(file);
    }
  }

  refreshFileExplorer(): void {
    this.requestFileExplorerSort();
    if (this.shouldScanHiddenPaths() && !this.isScanning) {
      void this.enableHiddenFiles(false);
    }
    this.applyRulesSoon();
  }

  async syncFileExplorer(showNotice = false): Promise<void> {
    this.requestFileExplorerSort();

    if (this.shouldScanHiddenPaths()) {
      await this.enableHiddenFiles(showNotice);
    }

    this.applyRules();
    this.requestFileExplorerSort();
  }

  async exportDebugSnapshot(): Promise<string | null> {
    const leaves = this.app.workspace.getLeavesOfType("file-explorer") as FileExplorerLeaf[];
    const snapshot = {
      generatedAt: new Date().toISOString(),
      layoutReady: this.layoutReady,
      experimentalRevealEnabled: this.plugin.settings.experimentalRevealEnabled,
      indexedPaths: this.indexedPaths.size,
      leafCount: leaves.length,
      leaves: leaves.map((leaf, index) => {
        const view = leaf.view;
        const items = Object.entries(view?.fileItems ?? {});
        return {
          index,
          viewKeys: ownKeys(view),
          itemCount: items.length,
          items: items.slice(0, 200).map(([itemPath, item]) => ({
            path: itemPath,
            itemKeys: ownKeys(item),
            prototypeKeys: ownKeys(Object.getPrototypeOf(item) as Record<string, unknown> | null),
          })),
        };
      }),
      indexedSample: [...this.indexedPaths].slice(0, 200),
    };

    const debugPath = `${this.app.vault.configDir}/plugins/dotpass/debug-file-explorer.json`;
    const adapter = this.app.vault.adapter as DataAdapter & {
      write?: (normalizedPath: string, data: string) => Promise<void>;
    };
    if (typeof adapter.write === "function") {
      await adapter.write(debugPath, JSON.stringify(snapshot, null, 2));
      return debugPath;
    }

    console.log("Dotpass debug snapshot", snapshot);
    return null;
  }

  async rescanHiddenFiles(showNotice = true): Promise<void> {
    if (!this.shouldScanHiddenPaths()) {
      return;
    }

    if (!Platform.isDesktopApp || !this.isSupportedDesktopAdapter()) {
      if (showNotice) new Notice("Dotpass hidden-file reveal requires desktop FileSystemAdapter.", NOTICE_TIMEOUT);
      return;
    }

    await this.enableHiddenFiles(showNotice);
  }

  async enableHiddenFiles(showNotice = false): Promise<void> {
    if (!this.layoutReady || this.isScanning || !this.isSupportedDesktopAdapter()) {
      return;
    }

    this.isScanning = true;
    const beforeCount = this.indexedPaths.size;

    try {
      this.rememberAndEnableUnsupportedFiles();
      this.patchAdapter();
      this.suppressDotfileWarning();

      const discovered: string[] = [];
      await this.walkVault("", discovered);
      discovered.sort((a, b) => {
        const depthDelta = a.split("/").length - b.split("/").length;
        return depthDelta !== 0 ? depthDelta : a.localeCompare(b);
      });

      for (const vaultPath of discovered) {
        if (this.shouldRevealVaultPath(vaultPath)) {
          this.indexedPaths.add(vaultPath);
          await this.showFile(vaultPath);
        }
      }

      this.applyRulesSoon();

      if (showNotice) {
        const newCount = this.indexedPaths.size - beforeCount;
        new Notice(`Dotpass indexed ${this.indexedPaths.size} hidden paths (${newCount} new).`, NOTICE_TIMEOUT);
      }
    } catch (error) {
      console.error("[dotpass] hidden file scan failed", error);
      if (showNotice) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`Dotpass scan failed: ${message}`, NOTICE_TIMEOUT);
      }
    } finally {
      this.isScanning = false;
    }
  }

  private async walkVault(vaultPath: string, discovered: string[]): Promise<void> {
    const diskPath = vaultPath ? path.join(this.basePath, vaultPath) : this.basePath;
    let entries: fs.Dirent[];

    try {
      entries = await fs.promises.readdir(diskPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const childPath = normalizePath(vaultPath ? `${vaultPath}/${entry.name}` : entry.name);
      if (this.isIgnoredVaultPath(childPath)) continue;

      if (this.isHiddenVaultPath(childPath)) {
        discovered.push(childPath);
      }

      if (entry.isDirectory()) {
        await this.walkVault(childPath, discovered);
      }
    }
  }

  async disableHiddenFiles(): Promise<void> {
    const adapter = this.app.vault.adapter as RevealAdapter;
    const originalDeletion = this.originalReconcileDeletion;

    this.restoreAdapter();

    if (originalDeletion && typeof adapter.getRealPath === "function") {
      for (const vaultPath of [...this.indexedPaths]) {
        try {
          const realPath = adapter.getRealPath(vaultPath);
          await (originalDeletion(realPath, vaultPath) as Promise<void>);
        } catch {
          // already gone or not applicable
        }
      }
    }

    this.indexedPaths.clear();
    this.restoreDotfileWarning();
    this.restoreUnsupportedFiles();
    this.requestFileExplorerSort();
    this.applyRules();
  }

  private isSupportedDesktopAdapter(): boolean {
    return this.app.vault.adapter instanceof FileSystemAdapter && this.basePath.length > 0;
  }

  private getBasePath(): string {
    const adapter = this.app.vault.adapter as RevealAdapter;
    return typeof adapter.getBasePath === "function" ? adapter.getBasePath() ?? "" : "";
  }

  private rememberAndEnableUnsupportedFiles(): void {
    if (this.originalShowUnsupportedFiles !== undefined) return;

    const vault = this.app.vault;
    if (typeof vault.setConfig !== "function") return;

    try {
      this.originalShowUnsupportedFiles = typeof vault.getConfig === "function" ? vault.getConfig("showUnsupportedFiles") : undefined;
      vault.setConfig("showUnsupportedFiles", true);
    } catch (error) {
      console.warn("[dotpass] unable to enable unsupported file visibility", error);
    }
  }

  private restoreUnsupportedFiles(): void {
    if (this.originalShowUnsupportedFiles === undefined) return;

    const vault = this.app.vault;
    if (typeof vault.setConfig !== "function") return;

    try {
      vault.setConfig("showUnsupportedFiles", this.originalShowUnsupportedFiles);
    } catch (error) {
      console.warn("[dotpass] unable to restore unsupported file visibility", error);
    } finally {
      this.originalShowUnsupportedFiles = undefined;
    }
  }

  private patchAdapter(): void {
    if (!this.isSupportedDesktopAdapter() || this.originalReconcileDeletion) return;

    const adapter = this.app.vault.adapter as RevealAdapter;
    if (typeof adapter.reconcileDeletion !== "function") return;

    this.originalReconcileDeletion = adapter.reconcileDeletion.bind(adapter);
    const origDeletion = this.originalReconcileDeletion;

    adapter.reconcileDeletion = (realPath: string, vaultPath: string, ...args: unknown[]): unknown => {
      if (this.shouldRevealVaultPath(vaultPath)) {
        this.indexedPaths.add(vaultPath);
        void this.showFile(vaultPath);
        return;
      }
      return origDeletion!(realPath, vaultPath, ...args);
    };
  }

  private restoreAdapter(): void {
    if (!this.originalReconcileDeletion) return;

    const adapter = this.app.vault.adapter as RevealAdapter;
    adapter.reconcileDeletion = this.originalReconcileDeletion;
    this.originalReconcileDeletion = null;
  }

  private async showFile(vaultPath: string): Promise<void> {
    const adapter = this.app.vault.adapter as RevealAdapter;
    if (typeof adapter.reconcileFileInternal === "function") {
      const realPath = this.getRealPath(vaultPath);
      await adapter.reconcileFileInternal(realPath, vaultPath);
    }
  }

  private shouldRevealVaultPath(vaultPath: string): boolean {
    const normalized = normalizePath(vaultPath);
    if (!this.isHiddenVaultPath(normalized) || this.isIgnoredVaultPath(normalized)) {
      return false;
    }

    const target = this.targetForPath(normalized);
    const evaluation = evaluateVisibility(this.plugin.settings, createTargetInfo(normalized, target));
    if (evaluation.action === "hide") return false;
    if (evaluation.action === "show") return true;
    if (this.hasShownAncestorFolder(normalized)) return true;
    return this.plugin.settings.experimentalRevealEnabled;
  }

  private hasShownAncestorFolder(vaultPath: string): boolean {
    const posix = normalizePath(vaultPath);
    let parentPath = posix.includes("/") ? posix.slice(0, posix.lastIndexOf("/")) : "";

    while (parentPath) {
      if (this.isIgnoredVaultPath(parentPath)) return false;

      const evaluation = evaluateVisibility(this.plugin.settings, createTargetInfo(parentPath, "folder"));
      if (evaluation.action === "hide") return false;
      if (evaluation.action === "show") return true;

      const slashIndex = parentPath.lastIndexOf("/");
      parentPath = slashIndex > 0 ? parentPath.slice(0, slashIndex) : "";
    }

    return false;
  }

  private shouldScanHiddenPaths(): boolean {
    if (!this.plugin.settings.enabled) return false;
    if (!Platform.isDesktopApp || !this.isSupportedDesktopAdapter()) return false;
    return this.plugin.settings.experimentalRevealEnabled || this.hasEnabledShowRules();
  }

  private hasEnabledShowRules(): boolean {
    return this.plugin.settings.rules.some((rule) => rule.enabled && rule.action === "show");
  }

  private isHiddenVaultPath(vaultPath: string): boolean {
    return normalizePath(vaultPath)
      .split("/")
      .filter(Boolean)
      .some((segment) => segment.startsWith("."));
  }

  private isIgnoredVaultPath(vaultPath: string): boolean {
    return normalizePath(vaultPath)
      .split("/")
      .filter(Boolean)
      .some((segment) => segment === this.app.vault.configDir || ALWAYS_EXCLUDED.has(segment));
  }

  private targetForPath(vaultPath: string): "file" | "folder" {
    const abstractFile = this.app.vault.getAbstractFileByPath(vaultPath);
    if (abstractFile instanceof TFolder) return "folder";
    if (abstractFile instanceof TFile) return "file";

    try {
      const stat = fs.lstatSync(path.join(this.basePath, vaultPath));
      return stat.isDirectory() ? "folder" : "file";
    } catch {
      return "file";
    }
  }

  private applyRuleToFileItem(file: TAbstractFile): void {
    const target = file instanceof TFolder ? "folder" : file instanceof TFile ? "file" : null;
    if (!target) return;

    const result = evaluateVisibility(this.plugin.settings, createTargetInfo(file.path, target));
    const elements = this.findFileElements(file.path);

    for (const element of elements) {
      if (result.action === "hide") {
        element.addClass("dotpass-hidden");
        element.setAttribute("data-dotpass-action", "hide");
      } else if (result.action === "show") {
        element.removeClass("dotpass-hidden");
        element.setAttribute("data-dotpass-action", "show");
      }
    }
  }

  private findFileElements(vaultPath: string): HTMLElement[] {
    const escaped = cssEscape(vaultPath);
    const selectors = [
      `.nav-file-title[data-path="${escaped}"]`,
      `.nav-folder-title[data-path="${escaped}"]`,
      `[data-path="${escaped}"]`,
    ];

    const elements = new Set<HTMLElement>();
    selectors.forEach((selector) => {
      activeDocument.querySelectorAll<HTMLElement>(selector).forEach((element) => elements.add(element));
    });

    const privateItem = this.findPrivateFileItem(vaultPath);
    if (privateItem?.selfEl) elements.add(privateItem.selfEl);
    if (privateItem?.el) elements.add(privateItem.el);

    return [...elements];
  }

  private findPrivateFileItem(vaultPath: string): { selfEl?: HTMLElement; el?: HTMLElement } | null {
    const leaves = this.app.workspace.getLeavesOfType("file-explorer") as FileExplorerLeaf[];

    for (const leaf of leaves) {
      const item = leaf.view?.fileItems?.[vaultPath];
      if (item) return item;
    }

    return null;
  }

  private requestFileExplorerSort(): void {
    const leaves = this.app.workspace.getLeavesOfType("file-explorer") as FileExplorerLeaf[];

    for (const leaf of leaves) {
      leaf.view?.requestSort?.();
    }
  }

  private suppressDotfileWarning(): void {
    const win = window as unknown as {
      i18next?: { t: (...args: unknown[]) => string };
    };
    if (!win.i18next || this.originalI18nT) return;

    const boundT: (...args: unknown[]) => string = win.i18next.t.bind(win.i18next);
    this.originalI18nT = boundT;

    win.i18next.t = (...args: unknown[]): string => {
      if (args[0] === "plugins.file-explorer.msg-bad-dotfile") {
        return "";
      }
      return boundT(...args);
    };
  }

  private restoreDotfileWarning(): void {
    if (!this.originalI18nT) return;

    const win = window as unknown as {
      i18next?: { t: (...args: unknown[]) => string };
    };
    if (win.i18next) {
      win.i18next.t = this.originalI18nT;
    }
    this.originalI18nT = null;
  }

  private getRealPath(vaultPath: string): string {
    const adapter = this.app.vault.adapter as RevealAdapter;
    if (typeof adapter.getRealPath === "function") {
      return adapter.getRealPath(vaultPath);
    }
    return vaultPath;
  }
}

function cssEscape(value: string): string {
  const css = window.CSS as { escape?: (input: string) => string } | undefined;
  return css?.escape ? css.escape(value) : value.replace(/["\\]/g, "\\$&");
}

function ownKeys(value: Record<string, unknown> | null | undefined): string[] {
  return value ? Object.getOwnPropertyNames(value).sort() : [];
}
