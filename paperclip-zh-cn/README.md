# paperclip-zh-cn — Paperclip 汉化插件（独立项目）

把 Paperclip 整个 Web 界面**动态**翻译成简体中文的独立插件项目。零依赖、零构建（源码即产物），
一条命令安装、一条命令回滚。

- **独立项目**：不进入 Paperclip 主仓库的 pnpm workspace，不修改宿主任何一行代码。
- **动态汉化**：运行时遍历 DOM 翻译文本节点与 `placeholder` / `title` / `aria-label` / `alt`，
  `MutationObserver` + 定时兜底扫描覆盖后渲染的内容（软导航、弹窗、流式输出）。
- **可回滚**：每处替换都记录原文，`stop()` / 卸载 / 组件卸载时逐字还原页面，回滚是「零残留」而不是「刷新」。
- **中文手册**：`docs/manual/` 是配套的中文指导手册（18 章，覆盖安装、组织架构、适配器、任务、心跳、预算、治理、CLI、API、部署、排错）。
- **无构建**：`src/` 即 ESM 产物，`node scripts/build.mjs` 只做拷贝 + 清单校验，可在离线实例上安装。

## 安装

```bash
cd paperclip-zh-cn
node bin/paperclip-zh.mjs install        # 构建 → 快照当前状态 → paperclipai plugin install/enable
```

安装后刷新浏览器标签页，右下角出现 `中/EN` 开关。默认 `auto`：浏览器首选语言为 `zh-*` 时自动汉化。

也可以手动走宿主 CLI（等价）：

```bash
node scripts/build.mjs
paperclipai plugin install "$PWD" --local
paperclipai plugin enable paperclip.zh-cn
```

## 回滚与卸载

| 需求 | 命令 | 效果 |
| --- | --- | --- |
| 临时回滚（推荐） | `node bin/paperclip-zh.mjs rollback` | `paperclipai plugin disable`，界面立即恢复英文；插件与状态保留，`install` 可原样恢复 |
| 回滚到指定版本 | `node bin/paperclip-zh.mjs rollback --to 1.0.0` | 停用后重装清单版本为该版本的构建 |
| 完全卸载 | `node bin/paperclip-zh.mjs uninstall` | `paperclipai plugin uninstall`，保留插件状态 |
| 彻底清除 | `node bin/paperclip-zh.mjs uninstall --force --yes` | 同时清除插件状态与配置（需二次确认） |

`install` / `rollback` / `uninstall --force` 都会先把 `paperclipai plugin inspect` 快照写入 `.state/`，
便于事后审计。安装前需在宿主的插件能力审核中批准这三个能力：
`ui.action.register`、`plugin.state.read`、`plugin.state.write`（只用于记录语言偏好，不读写任何业务数据）。

## 配置（`instanceConfigSchema`）

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `mode` | `auto` \| `on` \| `off` | `auto` | 依据浏览器语言 / 始终汉化 / 始终英文 |
| `translateAttributes` | boolean | `true` | 同时翻译 `placeholder`/`title`/`aria-label`/`alt` |
| `skipCodeBlocks` | boolean | `true` | 跳过 `<pre>`/`<code>` 与可编辑区域 |

## 词典维护

词典是「英文原文 → 中文」的纯字面量表（`src/i18n/dictionary.zh-cn.js`），不含正则与模板，
因此宿主改名某个字符串只会导致那一条不再翻译，而不会让运行时出错。

```bash
node scripts/extract-strings.mjs            # 扫描 ../ui/src，产出 analysis/ui-strings.json（6588 条候选）
node scripts/extract-strings.mjs --out /tmp/strings.json
```

流程：抽取候选 → 人工审校 → 合并进词典 → `node --test "tests/*.test.mjs"`。
长句中的**多词短语**按词边界替换（`Copy link to clipboard` → `复制链接 to clipboard`）；
单词不做片段替换，避免误伤（`uncancelled` 不会被改成 `un取消ced`）。

## 架构

```
src/manifest.js            插件清单（ID paperclip.zh-cn，appShellOverlay 槽位）
src/worker.js              记录语言偏好（实例/公司作用域 state）+ 健康检查
src/i18n/dictionary.zh-cn.js  347 条汉化词条
src/i18n/translate.js      纯函数翻译引擎（无 DOM，可单测）
src/ui/runtime.js          DOM 运行时：扫描 / 观察 / 还原
src/ui/index.js            appShellOverlay 组件：中/EN 开关 + 生命周期
bin/paperclip-zh.mjs       install / rollback / uninstall / status
scripts/build.mjs          拷贝 + 清单校验（无打包器）
scripts/extract-strings.mjs  从 ui/src 抽取界面字符串
```

安全边界：不读任何业务数据、不发起网络请求、不写宿主 DOM 结构（只改文本节点内容与白名单属性），
不触碰 `input`/`textarea`/`code`/`pre`/`contenteditable`，自身开关标记 `data-paperclip-i18n="own"` 以免自译。

## 验证

```bash
node scripts/build.mjs                    # 清单结构 + UI 导出 + 词典规模校验
node --test "tests/*.test.mjs"             # 25 个用例：翻译引擎、运行时、还原保证、清单与宿主目录一致性
```
