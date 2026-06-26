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
  _exists?(fullPath: string, vaultPath: string): Promise<boolean>;
  getBasePath?(): string;
  getFullPath?(normalizedPath: string): string;
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

type RestoreFn = () => void;

const NOTICE_TIMEOUT = 6000;
const ALWAYS_EXCLUDED = new Set([".trash"]);

export class FileExplorerAdapter {
  private readonly app: App;
  private readonly plugin: DotpassPlugin;
  private readonly indexedPaths = new Set<string>();
  private readonly patchRestorers: RestoreFn[] = [];
  private refreshTimer: number | null = null;
  private basePath = "";
  private isScanning = false;
  private layoutReady = false;
  private originalShowUnsupportedFiles: unknown = undefined;
  private originalI18nT: ((...args: unknown[]) => string) | null = null;

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

    document.querySelectorAll(".dotpass-hidden").forEach((element) => {
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
    document.querySelectorAll(".dotpass-hidden").forEach((element) => {
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
    this.reconcileIndexedPaths();
    if (this.shouldScanHiddenPaths()) {
      void this.enableHiddenFiles(false);
    }
    this.applyRulesSoon();
  }

  async syncFileExplorer(showNotice = false): Promise<void> {
    this.requestFileExplorerSort();
    this.reconcileIndexedPaths();

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
      if (showNotice) new Notice("Dotpass hidden-file reveal requires Obsidian desktop FileSystemAdapter.", NOTICE_TIMEOUT);
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
      await this.rescanAdapter();

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

  async disableHiddenFiles(): Promise<void> {
    for (const restore of this.patchRestorers.splice(0).reverse()) {
      try {
        restore();
      } catch (error) {
        console.error("[dotpass] failed to restore adapter patch", error);
      }
    }

    const indexed = [...this.indexedPaths];
    indexed.sort((left, right) => {
      const depthDelta = right.split("/").length - left.split("/").length;
      return depthDelta !== 0 ? depthDelta : right.localeCompare(left);
    });

    for (let index = 0; index < indexed.length; index += 1) {
      const vaultPath = indexed[index];
      this.forgetIndexedPath(vaultPath);
      if (index > 0 && index % 100 === 0) {
        await waitForFrame();
      }
    }

    this.indexedPaths.clear();
    this.restoreDotfileWarning();
    this.restoreUnsupportedFiles();
    this.applyRulesSoon();
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
    if (!this.isSupportedDesktopAdapter() || this.patchRestorers.length > 0) return;

    this.patchReconcileDeletion();
  }

  private patchReconcileDeletion(): void {
    const adapter = this.app.vault.adapter as RevealAdapter;
    if (typeof adapter.reconcileDeletion !== "function") return;

    const original = adapter.reconcileDeletion;
    const self = this;

    adapter.reconcileDeletion = function (realPath: string, vaultPath: string, ...args: unknown[]): unknown {
      if (self.shouldRevealVaultPath(vaultPath)) {
        void self.revealPath(vaultPath);
        return;
      }
      return original.call(this, realPath, vaultPath, ...args);
    };

    this.patchRestorers.push(() => {
      adapter.reconcileDeletion = original;
    });
  }

  private async walkVault(vaultPath: string, discovered: string[]): Promise<void> {
    const diskPath = vaultPath ? path.join(this.basePath, vaultPath) : this.basePath;
    let entries: fs.Dirent[];

    try {
      entries = await fs.promises.readdir(diskPath, { withFileTypes: true });
    } catch (error) {
      console.warn(`[dotpass] unable to read ${vaultPath || "/"}`, error);
      return;
    }

    for (const entry of entries) {
      const childPath = normalizePath(vaultPath ? `${vaultPath}/${entry.name}` : entry.name);
      if (this.isIgnoredVaultPath(childPath)) continue;

      if (this.isHiddenVaultPath(childPath) && this.shouldRevealVaultPath(childPath)) {
        discovered.push(childPath);
      }

      if (entry.isDirectory()) {
        await this.walkVault(childPath, discovered);
      }
    }
  }

  private async revealPath(vaultPath: string, forceSupportingAncestor = false): Promise<TAbstractFile | null> {
    const normalized = normalizePath(vaultPath);
    if (!normalized || this.isIgnoredVaultPath(normalized) || (!forceSupportingAncestor && !this.shouldRevealVaultPath(normalized))) {
      return null;
    }

    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing) {
      this.indexedPaths.add(normalized);
      return existing;
    }

    const adapter = this.app.vault.adapter as RevealAdapter;
    if (typeof adapter.reconcileFileInternal === "function") {
      try {
        await this.revealParentPath(normalized);
        await adapter.reconcileFileInternal(this.getRealPath(normalized), normalized);
        const reconciled = this.app.vault.getAbstractFileByPath(normalized);
        if (reconciled) {
          this.indexedPaths.add(normalized);
          return reconciled;
        }
      } catch (error) {
        console.warn(`[dotpass] reconcileFileInternal failed for ${normalized}`, error);
      }
    }

    const stat = this.statVaultPath(normalized);
    if (!stat) return null;

    const parent = await this.ensureParentFolder(normalized);
    if (!parent) return null;

    const basename = path.posix.basename(normalized);
    const abstractFile = Object.create(stat.isDirectory() ? TFolder.prototype : TFile.prototype) as TAbstractFile & {
      name: string;
      parent: TFolder;
      path: string;
      vault: App["vault"];
      stat?: { ctime: number; mtime: number; size: number };
      children?: TAbstractFile[];
      basename?: string;
      extension?: string;
    };

    abstractFile.name = basename;
    abstractFile.parent = parent;
    abstractFile.path = normalized;
    abstractFile.vault = this.app.vault;

    if (stat.isDirectory()) {
      const folder = abstractFile as TFolder & { children: TAbstractFile[] };
      folder.children = [];
    } else {
      const file = abstractFile as TFile & { basename: string; extension: string; stat: { ctime: number; mtime: number; size: number } };
      const extensionIndex = basename.lastIndexOf(".");
      file.basename = extensionIndex > 0 ? basename.slice(0, extensionIndex) : basename;
      file.extension = extensionIndex > 0 ? basename.slice(extensionIndex + 1) : "";
      file.stat = {
        ctime: stat.birthtimeMs,
        mtime: stat.mtimeMs,
        size: stat.size,
      };
    }

    this.registerVaultItem(parent, abstractFile);
    this.indexedPaths.add(normalized);
    return abstractFile;
  }

  private async revealParentPath(vaultPath: string): Promise<TAbstractFile | null> {
    const parentPath = path.posix.dirname(vaultPath);
    if (!parentPath || parentPath === ".") {
      return this.app.vault.getRoot();
    }

    const existing = this.app.vault.getAbstractFileByPath(parentPath);
    if (existing) return existing;

    return this.revealPath(parentPath, true);
  }

  private async ensureParentFolder(vaultPath: string): Promise<TFolder | null> {
    const parentPath = path.posix.dirname(vaultPath);
    if (!parentPath || parentPath === ".") {
      return this.app.vault.getRoot();
    }

    const existing = this.app.vault.getAbstractFileByPath(parentPath);
    if (existing instanceof TFolder) return existing;

    const stat = this.statVaultPath(parentPath);
    if (!stat?.isDirectory()) return null;

    const revealed = await this.revealPath(parentPath, true);
    return revealed instanceof TFolder ? revealed : null;
  }

  private registerVaultItem(parent: TFolder, item: TAbstractFile): void {
    const adapter = this.app.vault.adapter as RevealAdapter;
    if (adapter.files) {
      adapter.files[item.path] = item;
    }

    if (!parent.children.some((child) => child.path === item.path)) {
      parent.children.push(item);
      parent.children.sort((left, right) => left.name.localeCompare(right.name));
    }

    const metadataCache = this.app.metadataCache as { trigger?: (...args: unknown[]) => void };
    metadataCache.trigger?.("changed", item, "", undefined);
  }

  private statVaultPath(vaultPath: string): fs.Stats | null {
    try {
      return fs.lstatSync(path.join(this.basePath, vaultPath));
    } catch (error) {
      console.warn(`[dotpass] unable to stat ${vaultPath}`, error);
      return null;
    }
  }

  private forgetIndexedPath(vaultPath: string): void {
    const adapter = this.app.vault.adapter as RevealAdapter;
    const abstractFile = this.app.vault.getAbstractFileByPath(vaultPath);

    if (adapter.files) {
      delete adapter.files[vaultPath];
    }

    this.indexedPaths.delete(vaultPath);

    if (abstractFile?.parent) {
      abstractFile.parent.children = abstractFile.parent.children.filter((child) => child.path !== vaultPath);
    }

    const metadataCache = this.app.metadataCache as { trigger?: (...args: unknown[]) => void };
    if (abstractFile) {
      metadataCache.trigger?.("deleted", abstractFile);
    }
  }

  private isHiddenVaultPath(vaultPath: string): boolean {
    return normalizePath(vaultPath)
      .split("/")
      .filter(Boolean)
      .some((segment) => segment.startsWith("."));
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
    let parentPath = path.posix.dirname(normalizePath(vaultPath));

    while (parentPath && parentPath !== ".") {
      if (this.isIgnoredVaultPath(parentPath)) return false;

      const evaluation = evaluateVisibility(this.plugin.settings, createTargetInfo(parentPath, "folder"));
      if (evaluation.action === "hide") return false;
      if (evaluation.action === "show") return true;

      parentPath = path.posix.dirname(parentPath);
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

  private reconcileIndexedPaths(): void {
    for (const vaultPath of [...this.indexedPaths]) {
      if (!this.shouldRevealVaultPath(vaultPath) && !this.hasRevealedDescendant(vaultPath)) {
        this.forgetIndexedPath(vaultPath);
      }
    }
  }

  private hasRevealedDescendant(vaultPath: string): boolean {
    const prefix = `${normalizePath(vaultPath)}/`;
    return [...this.indexedPaths].some((indexedPath) => indexedPath.startsWith(prefix) && this.shouldRevealVaultPath(indexedPath));
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

    const stat = this.statVaultPath(vaultPath);
    return stat?.isDirectory() ? "folder" : "file";
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
      document.querySelectorAll<HTMLElement>(selector).forEach((element) => elements.add(element));
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

    this.originalI18nT = win.i18next.t.bind(win.i18next);
    const originalI18nT = this.originalI18nT;
    if (!originalI18nT) return;

    win.i18next.t = function (...args: unknown[]): string {
      if (args[0] === "plugins.file-explorer.msg-bad-dotfile") {
        return "";
      }
      return originalI18nT(...args);
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

  private async rescanAdapter(): Promise<void> {
    const adapter = this.app.vault.adapter as RevealAdapter;
    if (typeof adapter.listRecursive === "function") {
      await adapter.listRecursive("");
      return;
    }

    const discovered: string[] = [];
    await this.walkVault("", discovered);
    discovered.sort((left, right) => {
      const depthDelta = left.split("/").length - right.split("/").length;
      return depthDelta !== 0 ? depthDelta : left.localeCompare(right);
    });

    for (const vaultPath of discovered) {
      await this.revealPath(vaultPath);
    }
  }

  private getRealPath(vaultPath: string): string {
    const adapter = this.app.vault.adapter as RevealAdapter;
    if (typeof adapter.getRealPath === "function") {
      return adapter.getRealPath(vaultPath);
    }

    if (typeof adapter.getFullPath === "function") {
      return adapter.getFullPath(vaultPath);
    }

    return path.join(this.basePath, vaultPath);
  }
}

function cssEscape(value: string): string {
  const css = window.CSS as { escape?: (input: string) => string } | undefined;
  return css?.escape ? css.escape(value) : value.replace(/["\\]/g, "\\$&");
}

function ownKeys(value: Record<string, unknown> | null | undefined): string[] {
  return value ? Object.getOwnPropertyNames(value).sort() : [];
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}
