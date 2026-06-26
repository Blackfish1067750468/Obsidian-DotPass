# Dotpass

Dotpass is a desktop Obsidian plugin for controlling which files and folders are shown or hidden in the file explorer, including dot-prefixed hidden items such as `.claude`, `.git`, `.env`, and generated `.json` files.

Dotpass 是一个桌面端 Obsidian 插件，用于控制文件树中文件和文件夹的显示与隐藏，尤其适合管理 `.claude`、`.git`、`.env`、`.json` 等默认隐藏或容易干扰视图的内容。

## What Dotpass Does

- Show Obsidian's default hidden dot-prefixed files and folders.
- Add custom show or hide rules for folders and files.
- Override Obsidian defaults with explicit rules.
- Use option-based rules for common cases.
- Use expressions for advanced path, depth, glob, and regular-expression rules.
- Duplicate, sort, and edit rules from the settings page.
- Follow a selected file or folder when it is moved inside Obsidian.

## Quick Start

1. Enable **Dotpass visibility control**.
2. Turn on **Show Obsidian default hidden items** if you want dot-prefixed files and folders to appear.
3. Open the **Folder** or **File** tab.
4. Click **Add** to create a rule.
5. Use the eye icon to choose whether the rule shows or hides matched items.
6. Use option input by default:
   - Choose a range, such as all locations, under a path, a depth, or a specific object.
   - Choose a match type, such as full name or file extension.
   - Enter the final name, extension, depth, or select a path.
7. Drag the left handle to reorder rules. Higher rules win when multiple rules match.

Most changes apply immediately. Some hidden paths are cached by Obsidian's file explorer. If a rule does not appear to take effect, quit Obsidian and reopen the vault.

## Rule Priority

Dotpass evaluates visibility in this order:

1. Obsidian's default file-tree behavior.
2. The **Show Obsidian default hidden items** switch.
3. Custom folder and file rules.

Custom rules always have the final say. A specific hide rule can hide something that would otherwise be shown, and a specific show rule can reveal something even when Obsidian would normally hide it.

## Option Input

Option input is designed for most users and is the default for new rules.

### Folder Rules

| Need | Suggested option rule |
| --- | --- |
| Show every folder with a specific name | All locations + Full name + `.claude` |
| Hide one exact folder | Specific object + choose that folder |
| Show folders only under one path | Under path + choose folder + Full name |
| Apply rules by depth | Specific depth, depth above, depth below, or depth range |

### File Rules

| Need | Suggested option rule |
| --- | --- |
| Hide all files with one name | All locations + Full name + `settings.json` |
| Hide all files with one extension | All locations + Extension + `.json` |
| Show matching files under one folder | Under path + choose folder + Full name or Extension |
| Show or hide one exact file | Specific object + choose that file |

The follow-position switch appears only for specific object rules. It is useful when you want Dotpass to keep tracking a chosen file or folder after it is moved inside Obsidian.

## Expression Input

Expression input is for advanced users who need rules that are faster to type or not covered by the option controls.

| Expression | Meaning |
| --- | --- |
| `.claude` | Match by exact name |
| `settings.json` | Match by exact file name |
| `.json` | Match file extension |
| `in:01_Projects:.claude` | Match `.claude` under `01_Projects` |
| `path:01_Projects/demo/.claude` | Match one exact path |
| `depth=1:.claude` | Match at depth 1 |
| `depth>=2:.json` | Match at depth 2 or deeper |
| `depth<=3:.cache` | Match at depth 3 or above |
| `depth=2..4:.tmp` | Match inside a depth range |
| `glob:**/*.json` | Match using a glob pattern |
| `regex:^.*\\.json$` | Match using a regular expression |

Expression mode validates rules when the input loses focus. Option mode generates normalized rules automatically and does not require format validation.

## Notes

- Dotpass is desktop-only because revealing dot-prefixed hidden files requires desktop file-system access.
- Dotpass does not upload, delete, move, or edit your files.
- Rules are stored locally in your Obsidian plugin data.
- Hiding already-visible files uses a file-explorer adapter. Revealing hidden dotfiles scans the vault file system and asks Obsidian to reconcile the discovered paths.

## Build and Install from Source

```bash
cd dotpass
npm install
npm run build
```

The build syncs installable files into `../install/dotpass/`.

To install manually, copy the generated `install/dotpass/` folder into:

```text
<your-vault>/.obsidian/plugins/dotpass/
```

Then enable Dotpass from Obsidian's community plugin settings.

## Release Files

For an Obsidian community plugin release, the GitHub release for the current version should include:

- `manifest.json`
- `main.js`
- `styles.css`

The public repository should also contain this `README.md`, `manifest.json`, and `versions.json`.
