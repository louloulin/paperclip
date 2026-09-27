# paperclip-zh-cn — Paperclip 汉化插件（独立项目）

把 Paperclip 整个 Web 界面**动态**翻译成简体中文的独立插件项目。UI 侧零依赖零构建（源码即产物），
一条命令安装、一条命令回滚。worker 侧只依赖宿主 SDK `@paperclipai/plugin-sdk`（安装时自动 `npm install`）。

- **独立项目**：不进入 Paperclip 主仓库的 pnpm workspace，不修改宿主任何一行代码。
- **动态汉化**：运行时遍历 DOM 翻译文本节点与 `placeholder` / `title` / `aria-label` / `alt`，
  `MutationObserver` + 定时兜底扫描覆盖后渲染的内容（软导航、弹窗、流式输出）。
- **可回滚**：每处替换都记录原文，`stop()` / 卸载 / 组件卸载时逐字还原页面，回滚是「零残留」而不是「刷新」。
- **无构建**：`src/` 即 ESM 产物，`node scripts/build.mjs` 只做拷贝 + 清单校验，可在离线实例上安装。
- **真实可安装**：`scripts/check-install-contract.mjs` 复刻宿主 `plugin-loader` / `plugin-worker-manager`
  的安装期要求（入口存在、worker 裸导入可解析、UI 入口为 `<dir>/index.js`、UI 只含宿主可重写的裸导入、
  worker 能在最小环境下 `fork` 起来）。真实安装验证中发现的阻塞点（worker 首次 `fork` 即
  `ERR_MODULE_NOT_FOUND`）已由该检查固化为回归门。
- **真实验证**：`scripts/verify-install.mjs` 对着**运行中的 Paperclip 实例**跑完整条链路
  （install → enable → UI 贡献 → 宿主实际下发的 UI 产物真的能翻译页面 → 宿主 fork 出来的 worker
  真的应答 bridge → 状态写入落库 → disable 回滚 → enable 复原）。任一步失败即非零退出，
  没有实例时必定报红而不是「跳过」。

## 安装

```bash
cd paperclip-zh-cn
node bin/paperclip-zh.mjs install        # 依赖安装 + 契约检查 + 构建 → 快照状态 → paperclipai plugin install/enable
```

### 真实验证（对运行中的实例）

```bash
node bin/paperclip-zh.mjs verify --api-url http://localhost:3100 [--token <board token>] [--json report.json]
```

`verify` 不经过 `paperclipai` CLI，直接打宿主 HTTP API，因此验的是宿主行为而不是 CLI 封装：

| 步骤 | 断言 |
| --- | --- |
| `target` | `GET /api/health` 有应答（端口不通 = 红，不存在「静默通过」） |
| `install` | `POST /api/plugins/install`（本地路径）拿到插件 id |
| `enable` | `POST /api/plugins/:id/enable` 后状态为 `ready` |
| `registry` | `GET /api/plugins/:id/health` 四项检查全过 |
| `contribution` | `GET /api/plugins/ui-contributions` 里能查到 `zh-cn-locale-overlay` 槽位 |
| `ui-bundle` | `GET /_plugins/:id/ui/*.js` 下发的就是本项目产物 |
| `ui-runtime` | 用**宿主下发的字节**跑真实 DOM：Dashboard/Settings/Save/More actions/Search tasks 均变中文，`stop()` 逐字还原 |
| `worker-rpc` | `POST /api/plugins/:id/bridge/data` → 宿主 fork 的 worker 真应答（locale=zh-CN + 词典条数） |
| `worker-state` | `bridge/action` 写入语言偏好并能读回（state 真的落到实例） |
| `rollback` | `disable` 后 UI 贡献从宿主列表消失（回滚是真的停供） |
| `resume` | 再次 `enable` 回到 `ready`，偏好保留 |
| `uninstall` | `--uninstall` 时执行 `DELETE /api/plugins/:id` |

用法：`authenticated` 部署的实例需 `--token`（board token）；`local_trusted` 本机实例免令牌。
`--json <file>` 写出逐步骤日志供 CI / 审计。

> `paperclipai plugin install` 需要**看板账号且具备实例管理员权限**（宿主对 `/api/plugins/install`
> 的硬性要求，智能体令牌一律 403）。未登录时先执行 `paperclipai auth login`。

安装后刷新浏览器标签页，右下角出现 `中/EN` 开关。

**一条命令完成「安装 + 真实验证」**（推荐，需要看板会话）：

```bash
paperclipai auth login --api-base http://localhost:3100   # 只需一次
node bin/paperclip-zh.mjs verify --api-url http://localhost:3100 \
  --json .state/verify-$(date +%s).json
```

`verify` 会依次断言：实例可达 → **看板权限预检** → 真实 `POST /api/plugins/install` → enable →
宿主健康检查 → UI 贡献登记 → **宿主实际下发的 UI bundle 能把真实界面字符串翻成中文** → 该 bundle 的
`stop()` 能逐字还原 → 真实 fork 出来的 worker 通过 `/bridge/data` 应答 → `/bridge/action` 的状态写入
可读回 → **disable 后 UI 贡献消失（真回滚）** → 再次 enable 状态保留。任一步失败立即非零退出，
加 `--uninstall` 会在最后卸载。加 `--token <board token>` 可跳过登录。默认 `auto`：浏览器首选语言为 `zh-*` 时自动汉化。

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
bin/paperclip-zh.mjs       install / rollback / uninstall / status / verify
scripts/build.mjs          拷贝 + 清单校验（无打包器）
scripts/check-install-contract.mjs  宿主安装期契约检查（含真实 fork 冒烟）
scripts/verify-install.mjs          对真实实例的端到端安装验证（安装→健康→UI 贡献→bundle 实译→bridge→回滚→恢复）
scripts/verify-install.mjs  对运行中实例的真实安装验证（12 步）
scripts/extract-strings.mjs  从 ui/src 抽取界面字符串
```

安全边界：不读任何业务数据、不发起网络请求、不写宿主 DOM 结构（只改文本节点内容与白名单属性），
不触碰 `input`/`textarea`/`code`/`pre`/`contenteditable`，自身开关标记 `data-paperclip-i18n="own"` 以免自译。

## 验证

```bash
node scripts/build.mjs                    # 清单结构 + UI 导出 + 词典规模校验
node --test "tests/*.test.mjs"             # 28 个用例：翻译引擎、运行时、还原保证、清单与宿主目录一致性、验证器自身不会假绿
node bin/paperclip-zh.mjs verify           # 真实例 12 步安装验证（需一个运行中的 Paperclip）
```
