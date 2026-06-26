# Dotpass

> [简体中文](#简体中文) | [繁體中文](#繁體中文) | [English](#english) | [日本語](#日本語) | [한국어](#한국어) | [Español](#español)

---

## 简体中文

**控制 Obsidian 文件树中哪些文件和文件夹可见。**

Dotpass 可以让你在 Obsidian 仓库中显示或隐藏任何文件和文件夹，包括以点号开头的隐藏项（如 `.claude`、`.git`、`.env`、`.obsidian`），使用简单灵活的规则即可完成。

### 功能特性

- **显示隐藏的点号文件** — 显示 `.claude`、`.git`、`.env` 等 Obsidian 默认隐藏的点号开头内容
- **灵活的规则** — 支持按名称、后缀、路径、通配符、正则表达式或文件夹层级匹配
- **两种输入模式** — 选项模式（可视化下拉菜单）方便快速配置，表达式模式适合高级用户
- **跟随位置** — 规则可以跟踪指定的文件或文件夹，即使被移动或重命名也能保持生效
- **拖拽排序优先级** — 拖动规则调整顺序，排在上方的规则优先级更高
- **6 种语言** — 简体中文、繁体中文、English、日本語、한국어、Español
- **仅桌面端** — 显示隐藏的点号文件需要桌面端文件系统能力
- **隐私安全** — 不会上传、删除、移动或修改你的文件，所有设置保存在本地

### 安装

#### 从 Obsidian 社区插件安装（即将上线）

1. 打开 **设置 → 第三方插件 → 浏览**
2. 搜索 **Dotpass**
3. 点击 **安装**，然后 **启用**

#### 手动安装

1. 从 [最新发布页](https://github.com/Blackfish1067750468/Obsidian-DotPass/releases) 下载 `main.js`、`styles.css` 和 `manifest.json`
2. 在你的仓库 `.obsidian/plugins/` 目录下创建 `dotpass` 文件夹
3. 将三个文件复制到该文件夹中
4. 重启 Obsidian，在 设置 → 第三方插件 中启用 **Dotpass**

### 快速开始

1. 在设置中启用「启用 Dotpass 显隐控制」
2. 如需显示点号开头的隐藏内容，开启「显示 Obsidian 默认隐藏项」
3. 切换到「文件夹」或「文件」页签，添加规则
4. 使用眼睛图标切换显示/隐藏
5. 拖动左侧手柄调整规则顺序

### 规则语法

| 语法 | 示例 | 说明 |
|------|------|------|
| 名称 | `.claude` | 按名称匹配 |
| 后缀 | `.json` | 按后缀匹配（仅文件） |
| 指定路径下 | `in:Projects:.claude` | 指定路径下匹配 |
| 指定对象 | `path:Projects/.claude` | 匹配特定路径 |
| 层级 | `depth=1:.claude` | 按层级匹配 |
| 层级范围 | `depth=2..4:.tmp` | 按层级范围匹配 |
| 通配符 | `glob:**/*.json` | 通配符匹配 |
| 正则 | `regex:^.*\.json$` | 正则表达式匹配 |

---

## 繁體中文

**控制 Obsidian 檔案樹中哪些檔案和資料夾可見。**

Dotpass 可以讓你在 Obsidian 倉庫中顯示或隱藏任何檔案和資料夾，包括以點號開頭的隱藏項（如 `.claude`、`.git`、`.env`、`.obsidian`），使用簡單靈活的規則即可完成。

### 功能特性

- **顯示隱藏的點號檔案** — 顯示 `.claude`、`.git`、`.env` 等 Obsidian 預設隱藏的點號開頭內容
- **靈活的規則** — 支援按名稱、副檔名、路徑、萬用字元、正規表示式或資料夾層級匹配
- **兩種輸入模式** — 選項模式（視覺化下拉選單）方便快速設定，運算式模式適合進階使用者
- **跟隨位置** — 規則可以追蹤指定的檔案或資料夾，即使被移動或重新命名也能保持生效
- **拖曳排序優先順序** — 拖動規則調整順序，排在上方的規則優先順序更高
- **6 種語言** — 简体中文、繁體中文、English、日本語、한국어、Español
- **僅桌面端** — 顯示隱藏的點號檔案需要桌面端檔案系統能力
- **隱私安全** — 不會上傳、刪除、移動或修改你的檔案，所有設定儲存在本機

### 安裝

1. 從 [最新發佈頁](https://github.com/Blackfish1067750468/Obsidian-DotPass/releases) 下載 `main.js`、`styles.css` 和 `manifest.json`
2. 在你的倉庫 `.obsidian/plugins/` 目錄下建立 `dotpass` 資料夾
3. 將三個檔案複製到該資料夾中
4. 重新啟動 Obsidian，在 設定 → 第三方插件 中啟用 **Dotpass**

---

## English

**Control which files and folders are visible in Obsidian's file explorer.**

Dotpass lets you show or hide any file or folder in your vault — including dot-prefixed hidden items like `.claude`, `.git`, `.env`, and `.obsidian` — using simple, flexible rules.

### Features

- **Show hidden dotfiles** — Reveal `.claude`, `.git`, `.env`, and other dot-prefixed items that Obsidian hides by default
- **Flexible rules** — Match by name, extension, path, glob pattern, regex, or folder depth
- **Two input modes** — Options mode (visual dropdowns) for quick setup, or expression mode for power users
- **Follow location** — Rules can track a specific file or folder even when it is moved or renamed
- **Drag-to-sort priority** — Reorder rules by dragging; higher rules take precedence
- **6 languages** — Simplified Chinese, Traditional Chinese, English, Japanese, Korean, Spanish
- **Desktop only** — Requires desktop file-system access to reveal hidden dotfiles
- **Privacy safe** — Dotpass never uploads, deletes, moves, or modifies your files. All settings stay local

### Installation

#### From Obsidian Community Plugins (coming soon)

1. Open **Settings → Community plugins → Browse**
2. Search for **Dotpass**
3. Click **Install**, then **Enable**

#### Manual Installation

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/Blackfish1067750468/Obsidian-DotPass/releases)
2. Create a folder named `dotpass` inside your vault's `.obsidian/plugins/` directory
3. Copy the three files into that folder
4. Restart Obsidian and enable **Dotpass** in Settings → Community plugins

### Quick Start

1. Enable **Dotpass visibility control** in settings
2. To see dot-prefixed hidden items, turn on **Show Obsidian default hidden items**
3. Switch to the **Folder** or **File** tab and add rules
4. Use the **eye icon** to toggle between show and hide
5. Drag the **grip handle** on the left to reorder rules

### Rule Syntax

| Syntax | Example | Description |
|--------|---------|-------------|
| Name | `.claude` | Match by exact name |
| Extension | `.json` | Match by file extension (files only) |
| Under path | `in:Projects:.claude` | Match within a folder |
| Specific path | `path:Projects/.claude` | Match a single object |
| Depth | `depth=1:.claude` | Match at a specific depth |
| Depth range | `depth=2..4:.tmp` | Match within a depth range |
| Glob | `glob:**/*.json` | Glob pattern |
| Regex | `regex:^.*\.json$` | Regular expression |

---

## 日本語

**Obsidian のファイルツリーでファイルとフォルダの表示/非表示を制御します。**

Dotpass を使えば、Obsidian ボールト内のあらゆるファイルやフォルダを表示・非表示にできます。`.claude`、`.git`、`.env`、`.obsidian` などのドットファイルも、シンプルで柔軟なルールで管理できます。

### 機能

- **隠しドットファイルの表示** — Obsidian がデフォルトで非表示にする `.claude`、`.git`、`.env` などを表示
- **柔軟なルール** — 名前、拡張子、パス、Glob パターン、正規表現、フォルダ階層で指定可能
- **2 つの入力モード** — オプションモード（ドロップダウン）で簡単設定、式モードでパワーユーザー向け
- **場所の追跡** — ファイルやフォルダが移動/名前変更されてもルールが追跡
- **ドラッグで優先順位変更** — ルールをドラッグして並べ替え。上位のルールが優先
- **6 言語対応** — 简体中文、繁體中文、English、日本語、한국어、Español
- **デスクトップ専用** — 隠しドットファイルの表示にデスクトップファイルシステムが必要
- **プライバシー安全** — ファイルのアップロード、削除、移動、編集は一切行いません。設定はローカル保存

### インストール

1. [最新リリース](https://github.com/Blackfish1067750468/Obsidian-DotPass/releases) から `main.js`、`styles.css`、`manifest.json` をダウンロード
2. ボールトの `.obsidian/plugins/` ディレクトリに `dotpass` フォルダを作成
3. 3 つのファイルをそのフォルダにコピー
4. Obsidian を再起動し、設定 → コミュニティプラグインで **Dotpass** を有効化

---

## 한국어

**Obsidian 파일 트리에서 파일과 폴더의 표시/숨기기를 제어합니다.**

Dotpass를 사용하면 Obsidian 보관함의 모든 파일과 폴더를 표시하거나 숨길 수 있습니다. `.claude`, `.git`, `.env`, `.obsidian` 등 도트 접두사 숨김 항목도 간단하고 유연한 규칙으로 관리할 수 있습니다.

### 기능

- **숨겨진 도트 파일 표시** — Obsidian이 기본적으로 숨기는 `.claude`, `.git`, `.env` 등을 표시
- **유연한 규칙** — 이름, 확장자, 경로, Glob 패턴, 정규식 또는 폴더 깊이로 매칭
- **두 가지 입력 모드** — 옵션 모드(드롭다운)로 빠른 설정, 표현식 모드로 고급 사용
- **위치 추적** — 파일이나 폴더가 이동/이름 변경되어도 규칙이 추적
- **드래그로 우선순위 변경** — 규칙을 드래그하여 정렬. 위에 있는 규칙이 우선
- **6개 언어 지원** — 简体中文, 繁體中文, English, 日本語, 한국어, Español
- **데스크톱 전용** — 숨겨진 도트 파일 표시에 데스크톱 파일 시스템 필요
- **개인정보 보호** — 파일 업로드, 삭제, 이동, 편집을 하지 않습니다. 모든 설정은 로컬 저장

### 설치

1. [최신 릴리스](https://github.com/Blackfish1067750468/Obsidian-DotPass/releases)에서 `main.js`, `styles.css`, `manifest.json` 다운로드
2. 보관함의 `.obsidian/plugins/` 디렉토리에 `dotpass` 폴더 생성
3. 세 파일을 해당 폴더에 복사
4. Obsidian을 재시작하고 설정 → 커뮤니티 플러그인에서 **Dotpass** 활성화

---

## Español

**Controla qué archivos y carpetas son visibles en el explorador de archivos de Obsidian.**

Dotpass te permite mostrar u ocultar cualquier archivo o carpeta en tu bóveda, incluyendo elementos ocultos con prefijo de punto como `.claude`, `.git`, `.env` y `.obsidian`, usando reglas simples y flexibles.

### Características

- **Mostrar archivos ocultos con punto** — Revela `.claude`, `.git`, `.env` y otros elementos que Obsidian oculta por defecto
- **Reglas flexibles** — Coincidencia por nombre, extensión, ruta, patrón glob, regex o profundidad de carpeta
- **Dos modos de entrada** — Modo de opciones (menús desplegables) para configuración rápida, o modo de expresión para usuarios avanzados
- **Seguir ubicación** — Las reglas pueden rastrear un archivo o carpeta específico incluso cuando se mueve o renombra
- **Arrastrar para ordenar prioridad** — Reordena las reglas arrastrando; las reglas superiores tienen prioridad
- **6 idiomas** — 简体中文, 繁體中文, English, 日本語, 한국어, Español
- **Solo escritorio** — Requiere acceso al sistema de archivos de escritorio para revelar archivos ocultos
- **Privacidad segura** — Dotpass nunca sube, elimina, mueve ni modifica tus archivos. Toda la configuración se almacena localmente

### Instalación

1. Descarga `main.js`, `styles.css` y `manifest.json` desde la [última versión](https://github.com/Blackfish1067750468/Obsidian-DotPass/releases)
2. Crea una carpeta llamada `dotpass` dentro del directorio `.obsidian/plugins/` de tu bóveda
3. Copia los tres archivos en esa carpeta
4. Reinicia Obsidian y activa **Dotpass** en Configuración → Plugins de la comunidad

---

## Building from Source

```bash
git clone https://github.com/Blackfish1067750468/Obsidian-DotPass.git
cd Obsidian-DotPass
npm install
npm run build
```

## Contributing

Issues and pull requests are welcome. Please open an issue to discuss major changes before submitting a PR.

## License

[MIT](LICENSE)

## Author

**Blackfish** — [GitHub](https://github.com/Blackfish1067750468) · [Email](mailto:jiang76565206@gmail.com)
