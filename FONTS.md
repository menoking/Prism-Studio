# 字体与排版

在 **设置 → Prism Studio → 字体与排版** 中，分别选择界面字体与笔记字体。默认沿用升级前的字体；界面字号默认跟随原有主题。界面字号可调至 12–20 px，笔记字号维持原有的 12–24 px，互不联动。预览同时显示中文、英文与数字。

界面字体有 7 个选项，笔记字体有 10 个选项，包含默认选项。实际随插件安装 8 个字体家族，字体只在使用时由本地加载，不请求 CDN，也不需要安装到 Windows 系统。

| 字体 | 选择理由与官方来源 |
| --- | --- |
| Inter | [官方项目](https://rsms.me/inter/)面向屏幕阅读与界面设计；中文搭配 Noto Sans SC。 |
| Manrope | [官方项目](https://github.com/sharanda/manrope)的现代几何无衬线字体；中文搭配 Noto Sans SC。 |
| IBM Plex Sans | [IBM 官方字体介绍](https://www.ibm.com/design/language/typography/typeface/)中的人文无衬线；中文搭配 Noto Sans SC。 |
| Noto Sans SC | [Noto CJK 官方项目](https://github.com/notofonts/noto-cjk)的简体中文黑体，与思源黑体同源，提供中英文统一的字体及中文回退。 |
| Noto Serif SC | [Noto CJK 官方项目](https://github.com/notofonts/noto-cjk)的简体中文宋体，与思源宋体同源，适合书刊阅读及中文衬线回退。 |
| Literata | [官方项目](https://github.com/googlefonts/literata)为数字阅读设计的衬线字体，具备字重与光学尺寸轴；中文搭配 Noto Serif SC。 |
| 霞鹜文楷 GB Lite | [官方项目](https://github.com/lxgw/LxgwWenKaiGB-Lite)的轻量楷书字体，适合阅读与随笔；未覆盖字符回退至 Noto Sans SC。 |
| JetBrains Mono | [官方项目](https://www.jetbrains.com/lp/mono/)面向代码阅读的等宽字体；用于技术笔记时中文搭配 Noto Sans SC。 |

这些字体按官方设计定位与实际中文覆盖选择，不宣称不存在的评分或排行榜。

## 苹果审美选项

参考 [Apple 字体介绍](https://developer.apple.com/fonts/)中的 San Francisco、苹方与 New York 的排版风格，提供两个选项：

- **系统简约**：Apple 平台优先使用已有的系统界面字体与苹方；Windows 使用 Inter + Noto Sans SC。
- **系统书刊**：本机有 New York 时优先使用；其他平台使用 Literata + Noto Serif SC。

这是开放字体提供的相近排版气质。插件不分发 Apple 字体文件，也不宣称精确复刻其字形。Apple 平台的实际字体由系统提供，本项目仅在 Windows 完成运行验证。

## 默认与重置

默认笔记字体继续遵循既有的等宽字体开关。选定具体字体时该开关禁用，选定字体直接生效；代码块及行内代码继续由 Obsidian 的代码字体设置控制。默认浮动编辑器保留原有等宽字体与字号，选定具体笔记字体后跟随新字体及笔记字号。

**重置字体**恢复界面、笔记的默认字体与界面跟随字号，保留原有的笔记字号、行高、等宽开关、配色与材质。

## 来源与许可

全部内置字体按 **SIL Open Font License 1.1** 分发，原始 TTF 文件未子集化、未改名、未修改字形。各字体的完整许可与版权声明均在 `fonts/LICENSE-*.txt`。字体家族的 `Prism …` 仅为 CSS 注册别名，不改变字体文件。

下载来源、版本与 SHA256 记录在 `fonts/SOURCES.json`；本地 `npm run package` 生成的发行包另有逐文件校验值 `release/SHA256.json`（不上传到 Release）。字体取自官方 Google Fonts 仓库及霞鹜文楷官方发布。

字体文件失败时会按字体栈回退到本机中文字体与通用字体。安装时应保留完整的 `fonts/` 文件夹。
