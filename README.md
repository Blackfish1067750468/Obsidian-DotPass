# Dotpass

**Control which files and folders are visible in Obsidian's file explorer.**

Dotpass lets you show or hide any file or folder in your vault — including dot-prefixed hidden items like `.claude`, `.git`, `.env`, and `.obsidian` — using simple, flexible rules.

**控制 Obsidian 文件树中哪些文件和文件夹可见。**

Dotpass 可以让你在 Obsidian 仓库中显示或隐藏任何文件和文件夹，包括以点号开头的隐藏项（如 `.claude`、`.git`、`.env`、`.obsidian`），使用简单灵活的规则即可完成。

---

## Features / 功能特性

- **Show hidden dotfiles** — Reveal `.claude`, `.git`, `.env`, and other dot-prefixed items that Obsidian hides by default.
- **Flexible rules** — Match by name, extension, path, glob pattern, regex, or folder depth.
- **Two input modes** — Options mode (visual dropdowns) for quick setup, or expression mode for power users.
- **Follow location** — Rules can track a specific file or folder even when it is moved or renamed.
- **Drag-to-sort priority** — Reorder rules by dragging; higher rules take precedence.
- **6 languages** — Simplified Chinese, Traditional Chinese, English, Japanese, Korean, Spanish.
- **Desktop only** — Requires desktop file-system access to reveal hidden dotfiles.
- **Privacy safe** — Dotpass never uploads, deletes, moves, or modifies your files. All settings stay local.

---

- **显示隐藏的点号文件** — 显示 `.claude`、`.git`、`.env` 等 Obsidian 默认隐藏的点号开头内容。
- **灵活的规则** — 支持按名称、后缀、路径、通配符、正则表达式或文件夹层级匹配。
- **两种输入模式** — 选项模式（可视化下拉菜单）方便快速配置，表达式模式适合高级用户。
- **跟随位置** — 规则可以跟踪指定的文件或文件夹，即使被移动或重命名也能保持生效。
- **拖拽排序优先级** — 拖动规则调整顺序，排在上方的规则优先级更高。
- **6 种语言** — 简体中文、繁体中文、English、日本語、한국어、Español。
- **仅桌面端** — 显示隐藏的点号文件需要桌面端文件系统能力。
- **隐私安全** — Dotpass 不会上传、删除、移动或修改你的文件，所有设置保存在本地。

---

## Installation / 安装

### From Obsidian Community Plugins (coming soon)

1. Open **Settings → Community plugins → Browse**.
2. Search for **Dotpass**.
3. Click **Install**, then **Enable**.

### Manual Installation / 手动安装

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/Blackfish1067750468/Obsidian-DotPass/releases).
2. Create a folder named `dotpass` inside your vault's `.obsidian/plugins/` directory.
3. Copy the three files into that folder.
4. Restart Obsidian and enable **Dotpass** in Settings → Community plugins.

---

1. 从 [最新发布页](https://github.com/Blackfish1067750468/Obsidian-DotPass/releases) 下载 `main.js`、`styles.css` 和 `manifest.json`。
2. 在你的仓库 `.obsidian/plugins/` 目录下创建 `dotpass` 文件夹。
3. 将三个文件复制到该文件夹中。
4. 重启 Obsidian，在 设置 → 第三方插件 中启用 **Dotpass**。

---

## Quick Start / 快速开始

1. Enable **Dotpass visibility control** in settings.
2. To see dot-prefixed hidden items, turn on **Show Obsidian default hidden items**.
3. Switch to the **Folder** or **File** tab and add rules.
4. Use the **eye icon** to toggle between show and hide.
5. Drag the **grip handle** on the left to reorder rules.

---

1. 在设置中启用「启用 Dotpass 显隐控制」。
2. 如需显示点号开头的隐藏内容，开启「显示 Obsidian 默认隐藏项」。
3. 切换到「文件夹」或「文件」页签，添加规则。
4. 使用**眼睛图标**切换显示/隐藏。
5. 拖动左侧**手柄**调整规则顺序。

---

## Rule Syntax / 规则语法

| Syntax | Example | Description |
|--------|---------|-------------|
| Name | `.claude` | Match by exact name / 按名称匹配 |
| Extension | `.json` | Match by file extension (files only) / 按后缀匹配（仅文件） |
| Under path | `in:Projects:.claude` | Match within a folder / 指定路径下匹配 |
| Specific path | `path:Projects/.claude` | Match a single object / 匹配特定路径 |
| Depth | `depth=1:.claude` | Match at a specific depth / 按层级匹配 |
| Depth range | `depth=2..4:.tmp` | Match within a depth range / 按层级范围匹配 |
| Glob | `glob:**/*.json` | Glob pattern / 通配符匹配 |
| Regex | `regex:^.*\.json$` | Regular expression / 正则表达式匹配 |

---

## Building from Source / 从源码构建

```bash
git clone https://github.com/Blackfish1067750468/Obsidian-DotPass.git
cd Obsidian-DotPass
npm install
npm run build
```

The compiled plugin files (`main.js`, `styles.css`, `manifest.json`) will be in the project root.

编译后的插件文件（`main.js`、`styles.css`、`manifest.json`）在项目根目录。

---

## Contributing / 贡献

Issues and pull requests are welcome. Please open an issue to discuss major changes before submitting a PR.

欢迎提交 Issue 和 Pull Request。重大变更请先开 Issue 讨论。

---

## License / 许可证

[MIT](LICENSE)

---

## Author / 作者

**Blackfish** — [GitHub](https://github.com/Blackfish1067750468) · [Email](mailto:jiang76565206@gmail.com)
