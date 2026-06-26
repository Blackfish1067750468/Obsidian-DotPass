import { App, FuzzySuggestModal, Modal, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder, setIcon } from "obsidian";
import DotpassPlugin from "./main";
import { createRuleId } from "./defaults";
import { createTranslator } from "./i18n";
import {
  DotpassAction,
  DotpassLanguage,
  DotpassOptionMatch,
  DotpassOptionRange,
  DotpassRule,
  DotpassScope,
} from "./types";

type RuleTarget = "file" | "folder";
type ParsedRule = Pick<DotpassRule, "scope" | "matcher">;

type OptionState = {
  range: DotpassOptionRange;
  match: DotpassOptionMatch;
  rangePath: string;
  value: string;
  minDepth?: number;
  maxDepth?: number;
};

export class DotpassSettingTab extends PluginSettingTab {
  private readonly plugin: DotpassPlugin;
  private activeRuleTarget: RuleTarget = "folder";

  constructor(app: App, plugin: DotpassPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const t = createTranslator(this.plugin.settings.language);

    containerEl.empty();
    const titleBar = containerEl.createDiv("dotpass-title-bar");
    titleBar.createEl("h2", { text: t("settingsTitle") });
    const helpIcon = titleBar.createSpan("dotpass-help-icon");
    helpIcon.ariaLabel = t("help");
    helpIcon.title = t("help");
    setIcon(helpIcon, "circle-help");
    helpIcon.onclick = () => new DotpassHelpModal(this.app, this.plugin.settings.language).open();

    const topBar = containerEl.createDiv("dotpass-top-settings");

    new Setting(topBar)
      .setName(t("language"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("zh-CN", "简体中文")
          .addOption("zh-TW", "繁體中文")
          .addOption("en", "English")
          .addOption("ja", "日本語")
          .addOption("ko", "한국어")
          .addOption("es", "Español")
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as DotpassLanguage;
            await this.plugin.saveSettingsAndApply();
            this.display();
          });
      });

    new Setting(topBar)
      .setName(t("globalEnabled"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettingsAndApply();
          this.display();
        });
      });

    if (!this.plugin.settings.enabled) {
      return;
    }

    new Setting(containerEl)
      .setName(t("experimentalReveal"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.experimentalRevealEnabled).onChange(async (value) => {
          this.plugin.settings.experimentalRevealEnabled = value;
          await this.plugin.saveSettingsOnly();
          if (value) {
            await this.plugin.rescanHiddenFiles();
          } else {
            await this.plugin.disableHiddenFiles();
          }
          this.display();
        });
      });

    containerEl.createEl("p", {
      cls: "dotpass-setting-note dotpass-persistent-note",
      text: t("persistentNote"),
    });

    const panel = containerEl.createDiv("dotpass-rule-panel");
    const tabs = panel.createDiv("dotpass-rule-tabs");
    this.renderRuleTab(tabs, "folder");
    this.renderRuleTab(tabs, "file");
    this.renderRuleColumn(panel, this.activeRuleTarget);
  }

  private renderRuleTab(containerEl: HTMLElement, target: RuleTarget): void {
    const t = createTranslator(this.plugin.settings.language);
    const tab = containerEl.createEl("button", {
      cls: `dotpass-rule-tab${this.activeRuleTarget === target ? " is-active" : ""}`,
      text: target === "folder" ? t("folder") : t("file"),
    });
    const icon = tab.createSpan("dotpass-rule-tab-icon");
    setIcon(icon, target === "folder" ? "folder" : "file-text");
    tab.onclick = () => {
      this.activeRuleTarget = target;
      this.display();
    };
  }

  private renderRuleColumn(containerEl: HTMLElement, target: RuleTarget): void {
    const t = createTranslator(this.plugin.settings.language);
    const column = containerEl.createDiv("dotpass-rule-column");
    const header = column.createDiv("dotpass-rule-column-header");
    const titleGroup = header.createDiv("dotpass-rule-column-title-group");
    const icon = header.createSpan("dotpass-rule-column-icon");
    setIcon(icon, target === "folder" ? "folder" : "file-text");
    titleGroup.appendChild(icon);
    titleGroup.createDiv({ text: target === "folder" ? t("folder") : t("file"), cls: "dotpass-rule-column-title" });

    const addBar = header.createDiv("dotpass-add-bar");
    new Setting(addBar)
      .setClass("dotpass-add-setting")
      .addButton((button) => {
        button.setButtonText(t("addRule")).onClick(async () => {
          this.plugin.settings.rules.push(createDefaultRule(target, "show", nextPriority(this.plugin.settings.rules, target)));
          await this.plugin.saveSettingsAndApply();
          this.display();
        });
      });

    const rules = getRulesForTarget(this.plugin.settings.rules, target);
    if (rules.length === 0) {
      column.createEl("p", { text: target === "folder" ? t("emptyFolderRules") : t("emptyFileRules"), cls: "dotpass-setting-note" });
      return;
    }

    const list = column.createDiv("dotpass-rule-list");
    rules.forEach((rule) => this.renderRuleRow(list, rule, target));
  }

  private renderRuleRow(containerEl: HTMLElement, rule: DotpassRule, target: RuleTarget): void {
    const t = createTranslator(this.plugin.settings.language);
    const row = containerEl.createDiv("dotpass-rule-row");
    row.dataset.ruleId = rule.id;

    row.addEventListener("dragend", () => row.removeClass("is-dragging"));
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      row.addClass("is-drag-over");
    });
    row.addEventListener("dragleave", () => row.removeClass("is-drag-over"));
    row.addEventListener("drop", async (event) => {
      event.preventDefault();
      row.removeClass("is-drag-over");
      const sourceId = event.dataTransfer?.getData("text/plain");
      const sourceTarget = event.dataTransfer?.getData("application/dotpass-target");
      if (!sourceId || sourceTarget !== target || sourceId === rule.id) return;

      reorderRules(this.plugin.settings.rules, target, sourceId, rule.id);
      await this.plugin.saveSettingsAndApply();
      this.display();
    });

    const handle = row.createSpan("dotpass-drag-handle");
    handle.ariaLabel = t("dragToSort");
    handle.draggable = true;
    setIcon(handle, "grip-vertical");
    handle.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", rule.id);
      event.dataTransfer?.setData("application/dotpass-target", target);
      event.dataTransfer?.setDragImage(row, 12, 12);
      row.addClass("is-dragging");
    });

    this.renderActionToggle(row, rule, target);
    this.renderModeToggle(row, rule, target);

    const editor = row.createDiv("dotpass-rule-editor");
    if ((rule.inputMode ?? "expression") === "options") {
      this.renderOptionsEditor(editor, rule, target);
    } else {
      this.renderExpressionEditor(editor, rule, target);
    }

    const actions = row.createDiv("dotpass-row-actions");
    this.renderFollowButton(actions, rule, target);

    const copyButton = actions.createEl("button", { cls: "clickable-icon dotpass-icon-button" });
    copyButton.ariaLabel = t("copyRule");
    copyButton.title = t("copyRule");
    setIcon(copyButton, "copy");
    copyButton.onclick = async () => {
      duplicateRule(this.plugin.settings.rules, rule, target, t);
      await this.plugin.saveSettingsAndApply();
      this.display();
    };

    const deleteButton = actions.createEl("button", { cls: "clickable-icon dotpass-icon-button" });
    deleteButton.ariaLabel = t("delete");
    setIcon(deleteButton, "trash-2");
    deleteButton.onclick = async () => {
      this.plugin.settings.rules = this.plugin.settings.rules.filter((item) => item.id !== rule.id);
      await this.plugin.saveSettingsAndApply();
      this.display();
    };
  }

  private renderActionToggle(containerEl: HTMLElement, rule: DotpassRule, target: RuleTarget): void {
    const t = createTranslator(this.plugin.settings.language);
    const button = containerEl.createEl("button", {
      cls: `clickable-icon dotpass-action-button is-${rule.action}`,
    });
    button.ariaLabel = rule.action === "show" ? t("showAction") : t("hideAction");
    button.title = button.ariaLabel;
    setIcon(button, rule.action === "show" ? "eye" : "eye-off");
    button.onclick = async () => {
      rule.action = rule.action === "show" ? "hide" : "show";
      rule.enabled = true;
      rule.updatedAt = Date.now();
      syncRuleName(rule);
      await this.plugin.saveSettingsAndApply();
      this.display();
    };
  }

  private renderModeToggle(containerEl: HTMLElement, rule: DotpassRule, target: RuleTarget): void {
    const t = createTranslator(this.plugin.settings.language);
    const isOptions = (rule.inputMode ?? "expression") === "options";
    const button = containerEl.createEl("button", { cls: "clickable-icon dotpass-mode-button" });
    button.ariaLabel = isOptions ? t("optionsInput") : t("expressionInput");
    button.title = button.ariaLabel;
    setIcon(button, isOptions ? "list-checks" : "braces");
    button.onclick = async () => {
      rule.inputMode = isOptions ? "expression" : "options";
      if (rule.inputMode === "options") {
        applyOptionsToRule(rule, deriveOptionState(rule, target), target);
      } else {
        rule.expression = getRuleExpression(rule, t);
      }
      rule.updatedAt = Date.now();
      await this.plugin.saveSettingsAndApply();
      this.display();
    };
  }

  private renderExpressionEditor(containerEl: HTMLElement, rule: DotpassRule, target: RuleTarget): void {
    const t = createTranslator(this.plugin.settings.language);
    const input = containerEl.createEl("input", {
      attr: {
        placeholder: target === "folder" ? t("folderPatternPlaceholder") : t("filePatternPlaceholder"),
        type: "text",
      },
      cls: "dotpass-rule-input",
      value: rule.expression ?? getRuleExpression(rule, t),
    });
    const message = containerEl.createDiv("dotpass-rule-message");
    const bindButton = containerEl.createEl("button", { text: t("bindCurrentPath"), cls: "dotpass-mini-button" });

    const refreshValidation = () => {
      const result = validateExpression(input.value, target, t);
      message.toggleClass("is-error", !result.valid);
      message.setText(result.valid ? describeParsedRule(result.parsed, t) : result.errors.join("; "));
      bindButton.toggleClass("is-hidden", !canBindExpressionToPath(input.value, target, this.app, t));
    };

    input.onblur = async () => {
      const result = validateExpression(input.value, target, t);
      refreshValidation();
      if (!result.valid || !result.parsed) return;

      rule.inputMode = "expression";
      rule.expression = input.value.trim();
      rule.scope = result.parsed.scope;
      rule.matcher = result.parsed.matcher;
      rule.follow = undefined;
      rule.enabled = true;
      rule.updatedAt = Date.now();
      syncRuleName(rule);
      await this.plugin.saveSettingsAndApply();
    };
    input.oninput = refreshValidation;

    bindButton.onclick = async () => {
      const result = validateExpression(input.value, target, t);
      if (!result.valid || !result.parsed || result.parsed.matcher.type !== "path") {
        refreshValidation();
        return;
      }

      const file = this.app.vault.getAbstractFileByPath(result.parsed.matcher.value);
      if (!isMatchingTarget(file, target)) {
        message.addClass("is-error");
        message.setText(t("targetNotFound"));
        return;
      }

      rule.inputMode = "expression";
      rule.expression = input.value.trim();
      rule.scope = result.parsed.scope;
      rule.matcher = result.parsed.matcher;
      rule.follow = createFollow(result.parsed.matcher.value, target, file);
      rule.updatedAt = Date.now();
      syncRuleName(rule);
      await this.plugin.saveSettingsAndApply();
      this.display();
    };

    refreshValidation();
  }

  private renderOptionsEditor(containerEl: HTMLElement, rule: DotpassRule, target: RuleTarget): void {
    const t = createTranslator(this.plugin.settings.language);
    const state = deriveOptionState(rule, target);
    const top = containerEl.createDiv("dotpass-options-grid");

    const rangeSelect = top.createEl("select", { cls: "dropdown" });
    addOption(rangeSelect, t("rangeAll"), "all");
    addOption(rangeSelect, t("rangeUnder"), "under");
    addOption(rangeSelect, t("rangeDepth"), "depth");
    addOption(rangeSelect, t("rangeDepthAtLeast"), "depthAtLeast");
    addOption(rangeSelect, t("rangeDepthAtMost"), "depthAtMost");
    addOption(rangeSelect, t("rangeDepthRange"), "depthRange");
    addOption(rangeSelect, t("rangeObject"), "object");
    rangeSelect.value = state.range;

    const rangePathButton = top.createEl("button", { cls: "dotpass-scope-button" });
    this.configureRangePathButton(rangePathButton, state, async (selected) => {
      state.rangePath = selected.path;
      applyOptionsToRule(rule, state, target, selected);
      await this.plugin.saveSettingsAndApply();
      this.display();
    });

    const matchSelect = top.createEl("select", { cls: "dropdown" });
    const matchOptionCount = this.populateMatchSelect(matchSelect, state, target);
    matchSelect.toggleClass("is-hidden", matchOptionCount <= 1);
    matchSelect.toggleClass("dotpass-grid-hidden", matchOptionCount <= 1);

    const inputWrap = top.createDiv("dotpass-input-with-action");
    const valueInput = inputWrap.createEl("input", {
      attr: { type: "text", placeholder: getOptionPlaceholder(state, target, t) },
      cls: "dotpass-rule-input",
      value: getOptionValue(state),
    });

    const objectButton = inputWrap.createEl("button", { cls: "clickable-icon dotpass-input-action-button" });
    this.configureObjectButton(objectButton, state, target, async (selected) => {
      state.value = selected.path;
      applyOptionsToRule(rule, state, target, selected);
      await this.plugin.saveSettingsAndApply();
      this.display();
    });

    const preview = containerEl.createDiv("dotpass-expression-preview");

    const saveOptions = async () => {
      updateStateFromControls(state, rangeSelect.value as DotpassOptionRange, matchSelect.value as DotpassOptionMatch, valueInput.value);
      applyOptionsToRule(rule, state, target);
      await this.plugin.saveSettingsAndApply();
      this.display();
    };

    rangeSelect.onchange = async () => {
      state.range = rangeSelect.value as DotpassOptionRange;
      if (state.range === "object") state.match = "object";
      if (state.range !== "object" && state.match === "object") state.match = "name";
      applyOptionsToRule(rule, state, target);
      await this.plugin.saveSettingsAndApply();
      this.display();
    };
    matchSelect.onchange = saveOptions;
    valueInput.onblur = saveOptions;

    preview.setText(`${t("expressionPrefix")}${getRuleExpression(rule, t)}`);
  }

  private populateMatchSelect(select: HTMLSelectElement, state: OptionState, target: RuleTarget): number {
    const t = createTranslator(this.plugin.settings.language);
    select.empty();
    if (state.range === "object") {
      addOption(select, t("matchObject"), "object");
      select.value = "object";
      return 1;
    }

    let count = 1;
    addOption(select, t("matchName"), "name");
    if (target === "file") {
      addOption(select, t("matchExtension"), "extension");
      count += 1;
    }
    select.value = state.match === "extension" && target === "file" ? "extension" : "name";
    return count;
  }

  private configureRangePathButton(
    button: HTMLButtonElement,
    state: OptionState,
    onChoose: (file: TAbstractFile) => void | Promise<void>,
  ): void {
    const t = createTranslator(this.plugin.settings.language);
    button.toggleClass("is-hidden", state.range !== "under");
    button.setText(state.rangePath ? `${t("scopeButtonLabel")}${state.rangePath}` : t("scopeButtonDefault"));
    button.ariaLabel = button.textContent ?? t("scopeButtonDefault");
    button.title = button.ariaLabel;
    button.onclick = () => new PathSuggestModal(this.app, "folder", t("selectFolder"), onChoose).open();
  }

  private configureObjectButton(
    button: HTMLButtonElement,
    state: OptionState,
    target: RuleTarget,
    onChoose: (file: TAbstractFile) => void | Promise<void>,
  ): void {
    const t = createTranslator(this.plugin.settings.language);
    button.toggleClass("is-hidden", state.range !== "object");
    setIcon(button, target === "folder" ? "folder-open" : "file-search");
    button.ariaLabel = state.value ? `${t("objectLabelFolder")}${state.value}` : target === "folder" ? t("selectFolder") : t("selectFile");
    button.title = button.ariaLabel;
    button.onclick = () => new PathSuggestModal(this.app, target, target === "folder" ? t("selectFolder") : t("selectFile"), onChoose).open();
  }

  private renderFollowButton(containerEl: HTMLElement, rule: DotpassRule, target: RuleTarget): void {
    const t = createTranslator(this.plugin.settings.language);
    const canFollow = rule.inputMode === "options" && rule.optionRange === "object" && rule.matcher.type === "path";
    if (!canFollow) return;
    const button = containerEl.createEl("button", {
      cls: `clickable-icon dotpass-icon-button dotpass-follow-button${rule.follow?.enabled ? " is-active" : ""}`,
    });
    button.ariaLabel = t("followLocation");
    button.title = t("followLocation");
    setIcon(button, rule.follow?.enabled ? "link" : "unlink");
    button.onclick = async () => {
      const file = this.app.vault.getAbstractFileByPath(rule.matcher.value);
      if (!isMatchingTarget(file, target)) return;

      rule.follow = rule.follow?.enabled ? undefined : createFollow(rule.matcher.value, target, file);
      rule.updatedAt = Date.now();
      await this.plugin.saveSettingsAndApply();
      this.display();
    };
  }
}

class PathSuggestModal extends FuzzySuggestModal<TAbstractFile> {
  constructor(
    app: App,
    private readonly target: RuleTarget,
    placeholder: string,
    private readonly onChoosePath: (file: TAbstractFile) => void | Promise<void>,
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): TAbstractFile[] {
    const files = this.app.vault.getAllLoadedFiles();
    return files.filter((file) => (this.target === "folder" ? file instanceof TFolder && file.path : file instanceof TFile));
  }

  getItemText(file: TAbstractFile): string {
    return file.path;
  }

  onChooseItem(file: TAbstractFile): void {
    void this.onChoosePath(file);
  }
}

class DotpassHelpModal extends Modal {
  constructor(app: App, private readonly language: DotpassLanguage) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    const t = createTranslator(this.language);
    contentEl.empty();
    contentEl.addClass("dotpass-help-modal");

    contentEl.createEl("h2", { text: t("helpTitle") });

    if (this.language === "zh-CN") {
      this.renderChinese(contentEl, t);
    } else if (this.language === "zh-TW") {
      this.renderChineseTW(contentEl, t);
    } else if (this.language === "ja") {
      this.renderJapanese(contentEl, t);
    } else if (this.language === "ko") {
      this.renderKorean(contentEl, t);
    } else if (this.language === "es") {
      this.renderSpanish(contentEl, t);
    } else {
      this.renderEnglish(contentEl, t);
    }
  }

  private renderChinese(contentEl: HTMLElement, t: (key: string) => string): void {
    createHelpSection(contentEl, t("helpPositioning"), [
      "Dotpass 用来控制 Obsidian 文件树中哪些文件夹或文件显示、隐藏，特别适合管理 .claude、.git、.json、.env 等默认隐藏或不想长期暴露的内容。",
      "规则优先级从低到高为：Obsidian 默认规则、显示 Obsidian 默认隐藏项、自定义文件夹/文件规则。自定义规则永远优先。",
    ]);
    createHelpSection(contentEl, t("helpQuickStart"), [
      `打开“启用 Dotpass 显隐控制”。`,
      `需要显示点号开头的隐藏内容时，打开“显示 Obsidian 默认隐藏项”。`,
      `在“文件夹”或“文件”页签中添加规则，使用眼睛图标切换显示/隐藏。`,
      "默认使用选项输入：先选范围，再选匹配方式，最后填写名字、后缀或选择路径。",
      "拖动最左侧手柄可以调整规则顺序。复制按钮可以克隆一条规则后继续修改。",
    ]);
    createHelpSection(contentEl, t("helpOptionsGuide"), [
      "全部位置 + 完整名字：匹配仓库中所有同名文件夹或文件，例如 .claude。",
      "指定路径下 + 完整名字：只匹配某个文件夹范围内的名字，例如 in:Projects:.claude。",
      `指定对象：选择一个具体文件夹或文件，适合“永远显示/隐藏这个对象”。此模式支持跟随位置。`,
      "文件规则额外支持后缀，例如 .json、.env。文件夹规则不支持后缀。",
      "层级规则用于按深度匹配，例如第一层、某层以上、某层以下或层级范围。",
    ]);
    createHelpSection(contentEl, t("helpExpressionGuide"), [
      "直接名字：.claude 或 settings.json。",
      "后缀：.json 仅用于文件规则。",
      "指定路径下：in:01_Projects:.claude。",
      "指定对象路径：path:01_Projects/demo/.claude。",
      "层级：depth=1:.claude、depth>=2:.json、depth<=3:.cache、depth=2..4:.tmp。",
      "通配符：glob:**/*.json。正则：regex:^.*\\.json$。",
      "表达式模式会在输入框失焦时校验格式；选项模式由界面生成规则，不需要校验。",
    ]);
    createHelpSection(contentEl, t("helpNotes"), [
      "Dotpass 不会上传、删除、移动或修改你的文件，只保存本地插件配置。",
      "多数规则会实时生效；少数隐藏路径受 Obsidian 文件树缓存影响，设置后若未变化，请退出 Obsidian 后重新进入仓库。",
      "插件仅支持桌面端，因为显示点号隐藏文件需要桌面文件系统能力。",
      "如果多条规则命中同一个对象，排在更上方、更具体的规则优先。",
    ]);
    createHelpSection(contentEl, t("helpFAQ"), [
      "为什么文件夹显示了，里面内容没显示？如果只显示文件夹本身，子内容仍可能受文件规则或 Obsidian 缓存影响；请检查文件规则，并重进仓库。",
      "什么时候使用跟随位置？当你选择的是具体文件或文件夹，并希望它在 Obsidian 内被移动后仍保持显示/隐藏时使用。",
      "什么时候使用表达式？当选项输入无法覆盖复杂通配符、正则或组合规则时使用。",
    ]);
  }

  private renderEnglish(contentEl: HTMLElement, t: (key: string) => string): void {
    createHelpSection(contentEl, t("helpPositioning"), [
      "Dotpass controls which folders and files are shown or hidden in Obsidian's file explorer, including dot-prefixed hidden items such as .claude, .git, .env, and .json files.",
      "Priority order (low to high): Obsidian defaults → Show Obsidian default hidden items → custom folder/file rules. Custom rules always win.",
    ]);
    createHelpSection(contentEl, t("helpQuickStart"), [
      "Enable \"Dotpass visibility control\" to activate the plugin.",
      "Turn on \"Show Obsidian default hidden items\" when you need dot-prefixed items to appear in the file explorer.",
      "Switch to the Folder or File tab and add rules. Use the eye icon to toggle between show and hide.",
      "Options input is the default mode: first choose a range, then a match type, then enter a name, extension, or select a path.",
      "Drag the left grip handle to reorder rules. Use the copy button to duplicate a rule before editing it.",
    ]);
    createHelpSection(contentEl, t("helpOptionsGuide"), [
      "All locations + Full name: matches every folder or file with that name across the vault, e.g. .claude.",
      "Under path + Full name: matches only within a specific folder scope, e.g. in:Projects:.claude.",
      "Specific object: select a single folder or file to always show or hide it. This mode supports Follow location.",
      "File rules additionally support extension matching, e.g. .json, .env. Folder rules do not support extensions.",
      "Depth rules match by folder depth: specific depth, at depth or deeper, at depth or shallower, or a depth range.",
    ]);
    createHelpSection(contentEl, t("helpExpressionGuide"), [
      "Name: .claude or settings.json.",
      "Extension: .json (file rules only).",
      "Under path: in:01_Projects:.claude.",
      "Specific path: path:01_Projects/demo/.claude.",
      "Depth: depth=1:.claude, depth>=2:.json, depth<=3:.cache, depth=2..4:.tmp.",
      "Glob: glob:**/*.json. Regex: regex:^.*\\.json$.",
      "Expression mode validates on blur; options mode generates rules from the UI and does not require manual validation.",
    ]);
    createHelpSection(contentEl, t("helpNotes"), [
      "Dotpass does not upload, delete, move, or edit your files. All settings are stored locally inside the vault's plugin config.",
      "Most rules take effect immediately. Some hidden paths are cached by Obsidian's file explorer; if a change does not appear, quit Obsidian and reopen the vault.",
      "Dotpass is desktop-only because revealing hidden dotfiles requires desktop file-system access.",
      "When multiple rules match the same item, the rule listed higher (with higher priority) and the more specific rule wins.",
    ]);
    createHelpSection(contentEl, t("helpFAQ"), [
      "Why is a folder visible but its contents are not? Showing a folder does not automatically show its children — they may be hidden by file rules or Obsidian's cache. Check your file rules and reopen the vault.",
      "When should I use Follow location? When you select a specific file or folder and want the rule to keep tracking it even if it is moved or renamed inside Obsidian.",
      "When should I use expression mode? When options input cannot cover complex glob patterns, regex, or combined scope rules.",
    ]);
  }

  private renderChineseTW(contentEl: HTMLElement, t: (key: string) => string): void {
    createHelpSection(contentEl, t("helpPositioning"), [
      "Dotpass 用來控制 Obsidian 檔案樹中哪些資料夾或檔案顯示、隱藏，特別適合管理 .claude、.git、.json、.env 等預設隱藏或不想長期暴露的內容。",
      "規則優先順序由低到高為：Obsidian 預設規則、顯示 Obsidian 預設隱藏項、自訂資料夾/檔案規則。自訂規則永遠優先。",
    ]);
    createHelpSection(contentEl, t("helpQuickStart"), [
      "開啟「啟用 Dotpass 顯隱控制」。",
      "需要顯示點號開頭的隱藏內容時，開啟「顯示 Obsidian 預設隱藏項」。",
      "在「資料夾」或「檔案」頁籤中新增規則，使用眼睛圖示切換顯示/隱藏。",
      "預設使用選項輸入：先選範圍，再選匹配方式，最後填寫名稱、副檔名或選擇路徑。",
      "拖動最左側手柄可以調整規則順序。複製按鈕可以複製一條規則後繼續修改。",
    ]);
    createHelpSection(contentEl, t("helpOptionsGuide"), [
      "全部位置 + 完整名稱：匹配倉庫中所有同名資料夾或檔案，例如 .claude。",
      "指定路徑下 + 完整名稱：只匹配某個資料夾範圍內的名稱，例如 in:Projects:.claude。",
      "指定物件：選擇一個具體資料夾或檔案，適合「永遠顯示/隱藏這個物件」。此模式支援跟隨位置。",
      "檔案規則額外支援副檔名，例如 .json、.env。資料夾規則不支援副檔名。",
      "層級規則用於按深度匹配，例如第一層、某層以上、某層以下或層級範圍。",
    ]);
    createHelpSection(contentEl, t("helpExpressionGuide"), [
      "直接名稱：.claude 或 settings.json。",
      "副檔名：.json 僅用於檔案規則。",
      "指定路徑下：in:01_Projects:.claude。",
      "指定物件路徑：path:01_Projects/demo/.claude。",
      "層級：depth=1:.claude、depth>=2:.json、depth<=3:.cache、depth=2..4:.tmp。",
      "萬用字元：glob:**/*.json。正規表示式：regex:^.*\\.json$。",
      "運算式模式會在輸入框失焦時校驗格式；選項模式由介面產生規則，不需要校驗。",
    ]);
    createHelpSection(contentEl, t("helpNotes"), [
      "Dotpass 不會上傳、刪除、移動或修改你的檔案，只保存本機插件設定。",
      "多數規則會即時生效；部分隱藏路徑受 Obsidian 檔案樹快取影響，設定後若未變化，請退出 Obsidian 後重新開啟倉庫。",
      "插件僅支援桌面端，因為顯示點號隱藏檔案需要桌面檔案系統能力。",
      "如果多條規則命中同一個物件，排在更上方、更具體的規則優先。",
    ]);
    createHelpSection(contentEl, t("helpFAQ"), [
      "為什麼資料夾顯示了，裡面內容沒顯示？如果只顯示資料夾本身，子內容仍可能受檔案規則或 Obsidian 快取影響；請檢查檔案規則，並重新開啟倉庫。",
      "什麼時候使用跟隨位置？當你選擇的是具體檔案或資料夾，並希望它在 Obsidian 內被移動後仍保持顯示/隱藏時使用。",
      "什麼時候使用運算式？當選項輸入無法覆蓋複雜萬用字元、正規表示式或組合規則時使用。",
    ]);
  }

  private renderJapanese(contentEl: HTMLElement, t: (key: string) => string): void {
    createHelpSection(contentEl, t("helpPositioning"), [
      "Dotpass は Obsidian のファイルツリーでフォルダやファイルの表示/非表示を制御します。.claude、.git、.json、.env などのドットファイルの管理に最適です。",
      "優先順位（低→高）：Obsidian デフォルト → デフォルト非表示項目の表示 → カスタムフォルダ/ファイルルール。カスタムルールが常に優先されます。",
    ]);
    createHelpSection(contentEl, t("helpQuickStart"), [
      "「Dotpass 表示/非表示制御を有効にする」をオンにします。",
      "ドットファイルを表示したい場合は「Obsidian のデフォルト非表示項目を表示」をオンにします。",
      "フォルダまたはファイルタブでルールを追加し、目のアイコンで表示/非表示を切り替えます。",
      "デフォルトはオプション入力：範囲を選択 → マッチ方法を選択 → 名前、拡張子、またはパスを入力します。",
      "左側のグリップハンドルをドラッグしてルールを並べ替えます。コピーボタンでルールを複製できます。",
    ]);
    createHelpSection(contentEl, t("helpOptionsGuide"), [
      "すべての場所 + 完全名：ボールト内の同名フォルダ/ファイルすべてにマッチ。例：.claude。",
      "パス配下 + 完全名：特定フォルダ範囲内のみマッチ。例：in:Projects:.claude。",
      "特定オブジェクト：特定のフォルダ/ファイルを選択。「常にこのオブジェクトを表示/非表示」に最適。場所の追跡をサポート。",
      "ファイルルールは拡張子マッチも対応（.json、.env など）。フォルダルールは拡張子非対応。",
      "階層ルール：特定の深さ、指定階層以深/以浅、階層範囲でマッチ。",
    ]);
    createHelpSection(contentEl, t("helpExpressionGuide"), [
      "名前：.claude または settings.json。",
      "拡張子：.json（ファイルルールのみ）。",
      "パス配下：in:01_Projects:.claude。",
      "特定パス：path:01_Projects/demo/.claude。",
      "階層：depth=1:.claude、depth>=2:.json、depth<=3:.cache、depth=2..4:.tmp。",
      "Glob：glob:**/*.json。正規表現：regex:^.*\\.json$。",
      "式モードはフォーカスが外れた時に検証。オプションモードは UI がルールを生成するため検証不要。",
    ]);
    createHelpSection(contentEl, t("helpNotes"), [
      "Dotpass はファイルのアップロード、削除、移動、編集を行いません。設定はボールト内にローカル保存されます。",
      "ほとんどのルールは即座に反映されます。一部の非表示パスは Obsidian のキャッシュの影響を受けます。変化がない場合は Obsidian を終了してボールトを再度開いてください。",
      "Dotpass はデスクトップ専用です（隠しドットファイルの表示にデスクトップファイルシステムが必要）。",
      "複数のルールが同じアイテムにマッチする場合、上位（高優先度）でより具体的なルールが優先されます。",
    ]);
    createHelpSection(contentEl, t("helpFAQ"), [
      "フォルダは表示されたが中身が表示されないのはなぜ？フォルダの表示は子要素の自動表示を意味しません。ファイルルールや Obsidian のキャッシュが影響している可能性があります。ファイルルールを確認し、ボールトを再度開いてください。",
      "場所の追跡はいつ使う？特定のファイル/フォルダを選択し、Obsidian 内で移動/名前変更されてもルールを維持したい場合に使用します。",
      "式モードはいつ使う？オプション入力で複雑な Glob パターン、正規表現、組み合わせルールをカバーできない場合に使用します。",
    ]);
  }

  private renderKorean(contentEl: HTMLElement, t: (key: string) => string): void {
    createHelpSection(contentEl, t("helpPositioning"), [
      "Dotpass는 Obsidian 파일 트리에서 폴더와 파일의 표시/숨기기를 제어합니다. .claude, .git, .json, .env 등 도트 파일 관리에 적합합니다.",
      "우선순위(낮음→높음): Obsidian 기본값 → 기본 숨김 항목 표시 → 사용자 정의 폴더/파일 규칙. 사용자 정의 규칙이 항상 우선합니다.",
    ]);
    createHelpSection(contentEl, t("helpQuickStart"), [
      "\"Dotpass 표시/숨기기 제어 활성화\"를 켜세요.",
      "도트 파일을 표시하려면 \"Obsidian 기본 숨김 항목 표시\"를 켜세요.",
      "폴더 또는 파일 탭에서 규칙을 추가하고, 눈 아이콘으로 표시/숨기기를 전환하세요.",
      "기본은 옵션 입력 모드: 범위 선택 → 매칭 방식 선택 → 이름, 확장자 또는 경로를 입력합니다.",
      "왼쪽 그립 핸들을 드래그하여 규칙 순서를 변경하세요. 복사 버튼으로 규칙을 복제할 수 있습니다.",
    ]);
    createHelpSection(contentEl, t("helpOptionsGuide"), [
      "모든 위치 + 전체 이름: 보관함 내 같은 이름의 모든 폴더/파일과 매칭. 예: .claude.",
      "경로 하위 + 전체 이름: 특정 폴더 범위 내에서만 매칭. 예: in:Projects:.claude.",
      "특정 객체: 특정 폴더/파일을 선택하여 항상 표시/숨기기. 위치 추적을 지원합니다.",
      "파일 규칙은 확장자 매칭도 지원합니다(.json, .env 등). 폴더 규칙은 확장자를 지원하지 않습니다.",
      "계층 규칙: 특정 깊이, 해당 계층 이하/이상, 계층 범위로 매칭합니다.",
    ]);
    createHelpSection(contentEl, t("helpExpressionGuide"), [
      "이름: .claude 또는 settings.json.",
      "확장자: .json (파일 규칙만 해당).",
      "경로 하위: in:01_Projects:.claude.",
      "특정 경로: path:01_Projects/demo/.claude.",
      "계층: depth=1:.claude, depth>=2:.json, depth<=3:.cache, depth=2..4:.tmp.",
      "Glob: glob:**/*.json. 정규식: regex:^.*\\.json$.",
      "표현식 모드는 포커스 해제 시 검증합니다. 옵션 모드는 UI에서 규칙을 생성하므로 검증이 필요 없습니다.",
    ]);
    createHelpSection(contentEl, t("helpNotes"), [
      "Dotpass는 파일을 업로드, 삭제, 이동 또는 편집하지 않습니다. 모든 설정은 보관함 내에 로컬 저장됩니다.",
      "대부분의 규칙은 즉시 적용됩니다. 일부 숨겨진 경로는 Obsidian 캐시의 영향을 받습니다. 변화가 없으면 Obsidian을 종료하고 보관함을 다시 열어주세요.",
      "Dotpass는 데스크톱 전용입니다(숨겨진 도트 파일 표시에 데스크톱 파일 시스템이 필요합니다).",
      "여러 규칙이 같은 항목에 매칭되면, 더 위에 있고(높은 우선순위) 더 구체적인 규칙이 우선합니다.",
    ]);
    createHelpSection(contentEl, t("helpFAQ"), [
      "폴더는 보이는데 내용이 보이지 않는 이유는? 폴더 표시는 하위 항목의 자동 표시를 의미하지 않습니다. 파일 규칙이나 Obsidian 캐시가 영향을 줄 수 있습니다. 파일 규칙을 확인하고 보관함을 다시 열어주세요.",
      "위치 추적은 언제 사용하나요? 특정 파일/폴더를 선택하고, Obsidian 내에서 이동/이름 변경되어도 규칙을 유지하고 싶을 때 사용합니다.",
      "표현식 모드는 언제 사용하나요? 옵션 입력으로 복잡한 Glob 패턴, 정규식 또는 조합 규칙을 처리할 수 없을 때 사용합니다.",
    ]);
  }

  private renderSpanish(contentEl: HTMLElement, t: (key: string) => string): void {
    createHelpSection(contentEl, t("helpPositioning"), [
      "Dotpass controla qué carpetas y archivos se muestran u ocultan en el explorador de archivos de Obsidian, incluyendo elementos ocultos con prefijo de punto como .claude, .git, .env y .json.",
      "Orden de prioridad (de menor a mayor): valores predeterminados de Obsidian → Mostrar elementos ocultos por defecto → reglas personalizadas de carpeta/archivo. Las reglas personalizadas siempre prevalecen.",
    ]);
    createHelpSection(contentEl, t("helpQuickStart"), [
      "Activa \"Control de visibilidad Dotpass\" para activar el plugin.",
      "Activa \"Mostrar elementos ocultos por defecto de Obsidian\" cuando necesites ver archivos con prefijo de punto.",
      "Cambia a la pestaña Carpeta o Archivo y añade reglas. Usa el icono del ojo para alternar entre mostrar y ocultar.",
      "La entrada de opciones es el modo predeterminado: primero elige un rango, luego un tipo de coincidencia, y después introduce un nombre, extensión o ruta.",
      "Arrastra el control izquierdo para reordenar reglas. Usa el botón de copiar para duplicar una regla antes de editarla.",
    ]);
    createHelpSection(contentEl, t("helpOptionsGuide"), [
      "Todas las ubicaciones + Nombre completo: coincide con cada carpeta o archivo con ese nombre en toda la bóveda. Ej: .claude.",
      "Bajo ruta + Nombre completo: coincide solo dentro de un ámbito de carpeta específico. Ej: in:Projects:.claude.",
      "Objeto específico: selecciona una carpeta o archivo individual para mostrarlo u ocultarlo siempre. Este modo admite Seguir ubicación.",
      "Las reglas de archivo también admiten coincidencia por extensión (.json, .env). Las reglas de carpeta no admiten extensiones.",
      "Las reglas de profundidad coinciden por nivel de carpeta: profundidad específica, mínima, máxima o rango.",
    ]);
    createHelpSection(contentEl, t("helpExpressionGuide"), [
      "Nombre: .claude o settings.json.",
      "Extensión: .json (solo reglas de archivo).",
      "Bajo ruta: in:01_Projects:.claude.",
      "Ruta específica: path:01_Projects/demo/.claude.",
      "Profundidad: depth=1:.claude, depth>=2:.json, depth<=3:.cache, depth=2..4:.tmp.",
      "Glob: glob:**/*.json. Regex: regex:^.*\\.json$.",
      "El modo de expresión valida al perder el foco; el modo de opciones genera reglas desde la interfaz y no requiere validación manual.",
    ]);
    createHelpSection(contentEl, t("helpNotes"), [
      "Dotpass no sube, elimina, mueve ni edita tus archivos. Toda la configuración se almacena localmente dentro de la bóveda.",
      "La mayoría de las reglas surten efecto de inmediato. Algunas rutas ocultas están en caché del explorador de archivos de Obsidian; si un cambio no aparece, cierra Obsidian y vuelve a abrir la bóveda.",
      "Dotpass es solo para escritorio porque revelar archivos ocultos con punto requiere acceso al sistema de archivos de escritorio.",
      "Cuando múltiples reglas coinciden con el mismo elemento, la regla más arriba (mayor prioridad) y más específica prevalece.",
    ]);
    createHelpSection(contentEl, t("helpFAQ"), [
      "¿Por qué una carpeta es visible pero su contenido no? Mostrar una carpeta no muestra automáticamente sus hijos — pueden estar ocultos por reglas de archivo o la caché de Obsidian. Revisa tus reglas de archivo y vuelve a abrir la bóveda.",
      "¿Cuándo debo usar Seguir ubicación? Cuando seleccionas un archivo o carpeta específico y quieres que la regla lo siga incluso si se mueve o renombra dentro de Obsidian.",
      "¿Cuándo debo usar el modo de expresión? Cuando la entrada de opciones no puede cubrir patrones glob complejos, regex o reglas de ámbito combinado.",
    ]);
  }
}

function createDefaultRule(target: RuleTarget, action: DotpassAction, priority: number): DotpassRule {
  const rule: DotpassRule = {
    id: createRuleId(),
    name: "",
    enabled: true,
    target,
    action,
    scope: { type: "global" },
    matcher: { type: "name", value: "" },
    inputMode: "options",
    optionRange: "all",
    optionMatch: "name",
    expression: "",
    priority,
    updatedAt: Date.now(),
  };
  syncRuleName(rule);
  return rule;
}

function getRulesForTarget(rules: DotpassRule[], target: RuleTarget): DotpassRule[] {
  return rules
    .filter((rule) => rule.target === target)
    .sort((a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt);
}

function nextPriority(rules: DotpassRule[], target: RuleTarget): number {
  const targetRules = getRulesForTarget(rules, target);
  return (targetRules[0]?.priority ?? 0) + 100;
}

function reorderRules(rules: DotpassRule[], target: RuleTarget, sourceId: string, targetId: string): void {
  const sorted = getRulesForTarget(rules, target);
  const sourceIndex = sorted.findIndex((rule) => rule.id === sourceId);
  const targetIndex = sorted.findIndex((rule) => rule.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const [movedRule] = sorted.splice(sourceIndex, 1);
  sorted.splice(targetIndex, 0, movedRule);
  sorted.forEach((rule, index) => {
    rule.priority = (sorted.length - index) * 100;
    rule.updatedAt = Date.now();
  });
}

function duplicateRule(rules: DotpassRule[], source: DotpassRule, target: RuleTarget, t: (key: string) => string): void {
  const duplicate: DotpassRule = {
    ...JSON.parse(JSON.stringify(source)) as DotpassRule,
    id: createRuleId(),
    name: `${source.name} ${t("ruleCopySuffix")}`,
    priority: source.priority - 1,
    updatedAt: Date.now(),
  };

  const index = rules.findIndex((rule) => rule.id === source.id);
  if (index >= 0) {
    rules.splice(index + 1, 0, duplicate);
  } else {
    rules.push(duplicate);
  }

  const sorted = getRulesForTarget(rules, target);
  sorted.forEach((rule, sortedIndex) => {
    rule.priority = (sorted.length - sortedIndex) * 100;
  });
}

function validateExpression(rawPattern: string, target: RuleTarget, t: (key: string) => string): { valid: boolean; errors: string[]; parsed?: ParsedRule } {
  const pattern = rawPattern.trim();
  const errors: string[] = [];
  if (!pattern) return { valid: false, errors: [t("exprEmpty")] };

  if (/^depth/i.test(pattern) && !/^depth\s*(=|>=|<=)\s*\d+\s*:/.test(pattern) && !/^depth\s*=\s*\d+\s*\.\.\s*\d+\s*:/.test(pattern)) {
    errors.push(t("exprDepthFormat"));
  }

  if (/^(in|under|below):/i.test(pattern) && !/^(in|under|below):[^:]+:.+$/i.test(pattern)) {
    errors.push(t("exprUnderFormat"));
  }

  const scoped = parseScopePrefix(pattern);
  const matcherPattern = scoped.pattern.trim();
  if (!matcherPattern) errors.push(t("exprMatcherEmpty"));

  const explicit = matcherPattern.match(/^([a-z]+):/i);
  const explicitName = explicit?.[1]?.toLowerCase();
  const allowed = new Set(["name", "path", "ext", "extension", "glob", "regex"]);
  if (explicitName && !allowed.has(explicitName)) errors.push(`${t("exprUnknownPrefix")}${explicitName}`);
  if (target === "folder" && (explicitName === "ext" || explicitName === "extension")) errors.push(t("exprFolderNoExt"));

  let parsed: ParsedRule | undefined;
  try {
    parsed = {
      scope: scoped.scope,
      matcher: createMatcher(matcherPattern, target),
    };
    if (parsed.matcher.type === "regex") new RegExp(parsed.matcher.value);
    if (parsed.matcher.type === "path" && !parsed.matcher.value) errors.push(t("exprPathEmpty"));
    if (parsed.matcher.type === "extension" && target !== "file") errors.push(t("exprFileExtOnly"));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return { valid: errors.length === 0, errors, parsed };
}

function parseScopePrefix(pattern: string): { scope: DotpassScope; pattern: string } {
  const depthRange = pattern.match(/^depth\s*=\s*(\d+)\s*\.\.\s*(\d+)\s*:(.+)$/i);
  if (depthRange) {
    return {
      scope: { type: "depthRange", minDepth: Number(depthRange[1]), maxDepth: Number(depthRange[2]) },
      pattern: depthRange[3] ?? "",
    };
  }

  const depthCompare = pattern.match(/^depth\s*(=|>=|<=)\s*(\d+)\s*:(.+)$/i);
  if (depthCompare) {
    const operator = depthCompare[1];
    const depth = Number(depthCompare[2]);
    const rest = depthCompare[3] ?? "";
    if (operator === "=") return { scope: { type: "depth", minDepth: depth }, pattern: rest };
    if (operator === ">=") return { scope: { type: "depthRange", minDepth: depth }, pattern: rest };
    return { scope: { type: "depthRange", minDepth: 0, maxDepth: depth }, pattern: rest };
  }

  const prefix = pattern.match(/^(?:in|under|below):([^:]+):(.+)$/i);
  if (prefix) {
    return {
      scope: { type: "prefix", path: normalizeRulePath(prefix[1] ?? "") },
      pattern: prefix[2] ?? "",
    };
  }

  return { scope: { type: "global" }, pattern };
}

function createMatcher(pattern: string, target: RuleTarget): DotpassRule["matcher"] {
  const explicit = pattern.match(/^(name|path|ext|extension|glob|regex):(.+)$/i);
  if (explicit) {
    const kind = explicit[1]?.toLowerCase();
    const value = explicit[2]?.trim() ?? "";
    if (kind === "name") return { type: "name", value };
    if (kind === "path") return { type: "path", value: normalizeRulePath(value) };
    if (kind === "ext" || kind === "extension") return { type: "extension", value };
    if (kind === "glob") return { type: "glob", value: normalizeRulePath(value) };
    if (kind === "regex") return { type: "regex", value };
  }

  const normalized = normalizeRulePath(pattern);
  if (normalized.includes("/") && hasWildcard(normalized)) return { type: "glob", value: normalized };
  if (normalized.includes("/")) return { type: "path", value: normalized };
  if (target === "file" && isExtensionPattern(normalized)) return { type: "extension", value: normalized };
  if (hasWildcard(normalized)) return { type: "glob", value: normalized };
  return { type: "name", value: normalized };
}

function deriveOptionState(rule: DotpassRule, target: RuleTarget): OptionState {
  if (rule.optionRange && rule.optionMatch) {
    return {
      range: rule.optionRange,
      match: rule.optionMatch,
      rangePath: rule.scope.path ?? "",
      value: rule.matcher.value,
      minDepth: rule.scope.minDepth,
      maxDepth: rule.scope.maxDepth,
    };
  }

  if (rule.matcher.type === "path") {
    return { range: "object", match: "object", rangePath: "", value: rule.matcher.value };
  }

  const match: DotpassOptionMatch = rule.matcher.type === "extension" && target === "file" ? "extension" : "name";
  if (rule.scope.type === "prefix") return { range: "under", match, rangePath: rule.scope.path ?? "", value: rule.matcher.value };
  if (rule.scope.type === "depth") return { range: "depth", match, rangePath: "", value: rule.matcher.value, minDepth: rule.scope.minDepth };
  if (rule.scope.type === "depthRange" && rule.scope.minDepth != null && rule.scope.maxDepth != null) {
    return { range: "depthRange", match, rangePath: "", value: rule.matcher.value, minDepth: rule.scope.minDepth, maxDepth: rule.scope.maxDepth };
  }
  if (rule.scope.type === "depthRange" && rule.scope.minDepth != null) {
    return { range: "depthAtLeast", match, rangePath: "", value: rule.matcher.value, minDepth: rule.scope.minDepth };
  }
  if (rule.scope.type === "depthRange" && rule.scope.maxDepth != null) {
    return { range: "depthAtMost", match, rangePath: "", value: rule.matcher.value, maxDepth: rule.scope.maxDepth };
  }

  return { range: "all", match, rangePath: "", value: rule.matcher.value };
}

function applyOptionsToRule(rule: DotpassRule, state: OptionState, target: RuleTarget, selected?: TAbstractFile): void {
  const normalizedValue = normalizeRulePath(state.value.trim());
  rule.inputMode = "options";
  rule.optionRange = state.range;
  rule.optionMatch = state.range === "object" ? "object" : state.match;
  rule.target = target;
  rule.enabled = true;

  if (state.range === "object") {
    rule.scope = { type: "global" };
    rule.matcher = { type: "path", value: normalizedValue };
    if (state.range === "object" && selected && isMatchingTarget(selected, target)) {
      rule.follow = undefined;
    }
  } else {
    rule.scope = scopeFromState(state);
    rule.matcher = matcherFromState(state, target);
    rule.follow = undefined;
  }

  rule.expression = getRuleExpression(rule);
  rule.updatedAt = Date.now();
  syncRuleName(rule);
}

function scopeFromState(state: OptionState): DotpassScope {
  if (state.range === "under") return { type: "prefix", path: normalizeRulePath(state.rangePath) };
  if (state.range === "depth") return { type: "depth", minDepth: state.minDepth ?? parseNumber(state.value, 1) };
  if (state.range === "depthAtLeast") return { type: "depthRange", minDepth: state.minDepth ?? 1 };
  if (state.range === "depthAtMost") return { type: "depthRange", minDepth: 0, maxDepth: state.maxDepth ?? 1 };
  if (state.range === "depthRange") return { type: "depthRange", minDepth: state.minDepth ?? 1, maxDepth: state.maxDepth ?? state.minDepth ?? 1 };
  return { type: "global" };
}

function matcherFromState(state: OptionState, target: RuleTarget): DotpassRule["matcher"] {
  if (state.match === "extension" && target === "file") return { type: "extension", value: state.value.trim() };
  return { type: "name", value: state.value.trim() };
}

function updateStateFromControls(state: OptionState, range: DotpassOptionRange, match: DotpassOptionMatch, rawValue: string): void {
  state.range = range;
  state.match = range === "object" ? "object" : match;
  if (range === "depth") state.minDepth = parseNumber(rawValue, state.minDepth ?? 1);
  else if (range === "depthAtLeast") state.minDepth = parseNumber(rawValue, state.minDepth ?? 1);
  else if (range === "depthAtMost") state.maxDepth = parseNumber(rawValue, state.maxDepth ?? 1);
  else if (range === "depthRange") {
    const [minRaw, maxRaw] = rawValue.split("..");
    state.minDepth = parseNumber(minRaw ?? "", state.minDepth ?? 1);
    state.maxDepth = parseNumber(maxRaw ?? "", state.maxDepth ?? state.minDepth);
  } else {
    state.value = rawValue;
  }
}

function getOptionValue(state: OptionState): string {
  if (state.range === "depth" || state.range === "depthAtLeast") return String(state.minDepth ?? 1);
  if (state.range === "depthAtMost") return String(state.maxDepth ?? 1);
  if (state.range === "depthRange") return `${state.minDepth ?? 1}..${state.maxDepth ?? state.minDepth ?? 1}`;
  return state.value;
}

function getOptionPlaceholder(state: OptionState, target: RuleTarget, t: (key: string) => string): string {
  if (state.range === "object") return target === "folder" ? t("placeholderObjectFolder") : t("placeholderObjectFile");
  if (state.range.startsWith("depth")) return state.range === "depthRange" ? t("placeholderDepthRange") : t("placeholderDepthNumber");
  if (state.match === "extension") return t("placeholderExtension");
  return target === "folder" ? t("placeholderFolderName") : t("placeholderFileName");
}

function getRuleExpression(rule: DotpassRule, t?: (key: string) => string): string {
  const pending = t ? t("pendingInput") : "<pending>";
  const matcher = matcherExpression(rule);
  if (!matcher.trim()) {
    if (rule.scope.type === "prefix") return `in:${rule.scope.path ?? ""}:${pending}`;
    if (rule.scope.type === "depth") return `depth=${rule.scope.minDepth ?? 1}:${pending}`;
    if (rule.scope.type === "depthRange" && rule.scope.minDepth != null && rule.scope.maxDepth != null) {
      return `depth=${rule.scope.minDepth}..${rule.scope.maxDepth}:${pending}`;
    }
    if (rule.scope.type === "depthRange" && rule.scope.minDepth != null) return `depth>=${rule.scope.minDepth}:${pending}`;
    if (rule.scope.type === "depthRange" && rule.scope.maxDepth != null) return `depth<=${rule.scope.maxDepth}:${pending}`;
    return pending;
  }
  if (rule.scope.type === "prefix") return `in:${rule.scope.path ?? ""}:${matcher}`;
  if (rule.scope.type === "depth") return `depth=${rule.scope.minDepth ?? 1}:${matcher}`;
  if (rule.scope.type === "depthRange" && rule.scope.minDepth != null && rule.scope.maxDepth != null) {
    return `depth=${rule.scope.minDepth}..${rule.scope.maxDepth}:${matcher}`;
  }
  if (rule.scope.type === "depthRange" && rule.scope.minDepth != null) return `depth>=${rule.scope.minDepth}:${matcher}`;
  if (rule.scope.type === "depthRange" && rule.scope.maxDepth != null) return `depth<=${rule.scope.maxDepth}:${matcher}`;
  return matcher;
}

function matcherExpression(rule: DotpassRule): string {
  if (rule.matcher.type === "path") return `path:${rule.matcher.value}`;
  if (rule.matcher.type === "extension") return rule.matcher.value;
  if (rule.matcher.type === "glob") return `glob:${rule.matcher.value}`;
  if (rule.matcher.type === "regex") return `regex:${rule.matcher.value}`;
  return rule.matcher.value;
}

function describeParsedRule(parsed: ParsedRule | undefined, t: (key: string) => string): string {
  if (!parsed) return "";
  const scope = parsed.scope.type === "global" ? t("descScopeGlobal") : parsed.scope.type === "prefix" ? `${t("descScopePrefix")}${parsed.scope.path}` : t("descScopeDepth");
  const matcher = parsed.matcher.type === "extension" ? `${t("descMatcherExt")}${parsed.matcher.value}` : parsed.matcher.type === "path" ? `${t("descMatcherPath")}${parsed.matcher.value}` : `${t("descMatcherDefault")}${parsed.matcher.value}`;
  return `${scope}, ${matcher}`;
}

function canBindExpressionToPath(rawPattern: string, target: RuleTarget, app: App, t: (key: string) => string): boolean {
  const result = validateExpression(rawPattern, target, t);
  if (!result.valid || result.parsed?.matcher.type !== "path") return false;
  return isMatchingTarget(app.vault.getAbstractFileByPath(result.parsed.matcher.value), target);
}

function createFollow(path: string, target: RuleTarget, file: TAbstractFile) {
  return {
    enabled: true,
    mode: "selectedItem" as const,
    originalPath: path,
    currentPath: path,
    targetKind: target,
    identityHint: {
      name: file.name,
      extension: file instanceof TFile ? file.extension : undefined,
      size: file instanceof TFile ? file.stat.size : undefined,
      ctime: file instanceof TFile ? file.stat.ctime : undefined,
      mtime: file instanceof TFile ? file.stat.mtime : undefined,
    },
    lastResolvedAt: Date.now(),
  };
}

function isMatchingTarget(file: TAbstractFile | null, target: RuleTarget): file is TAbstractFile {
  return target === "folder" ? file instanceof TFolder : file instanceof TFile;
}

function addOption(select: HTMLSelectElement, text: string, value: string): void {
  select.createEl("option", { text, value });
}

function createHelpSection(containerEl: HTMLElement, title: string, items: string[]): void {
  const section = containerEl.createDiv("dotpass-help-section");
  section.createEl("h3", { text: title });
  const list = section.createEl("ul");
  items.forEach((item) => list.createEl("li", { text: item }));
}

function syncRuleName(rule: DotpassRule): void {
  const action = rule.action === "show" ? "Show" : "Hide";
  const target = rule.target === "folder" ? "folder" : "file";
  const value = getRuleExpression(rule).trim() || "new rule";
  rule.name = `${action} ${target}: ${value}`;
}

function hasWildcard(value: string): boolean {
  return value.includes("*") || value.includes("?");
}

function normalizeRulePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^(\.\/)+/, "").replace(/\/+$/, "");
}

function isExtensionPattern(value: string): boolean {
  return /^\.[^./\\*?]+$/.test(value);
}

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
