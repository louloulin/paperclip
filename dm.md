# Paperclip Desktop & Mobile 非侵入式打包方案（dm.md）

> 目标：在不修改现有代码（monorepo 现有文件零改动）的前提下，新增独立模块，把 Paperclip 打包成可安装的 **Desktop 桌面应用**，并基于 **Capacitor** 提供 **手机端（iOS / Android）**。
> 本文是完整实施计划：代码分析 → 技术选型 → 模块设计 → 打包细节 → 里程碑 → 验收 → 风险。

---

## 0. 摘要

| 项 | 结论 |
|---|---|
| 桌面方案 | **Electron 壳，用 `ELECTRON_RUN_AS_NODE` 复用 Electron 内置 Node 运行 `@paperclipai/server`**，窗口直接加载 `http://127.0.0.1:<port>`（复用服务端自带的 SPA 静态托管） |
| 为什么不打包前端 | 服务端已内置 UI 静态托管（`server/src/app.ts` `uiMode=static`），桌面/移动端**复用同一份构建产物**，无需改前端 |
| 内置 Node 的前置条件（**已确认采纳，配强制预检**） | 服务要求 `Node >= 24.11.0`（`packages/shared/src/node-version.ts`，当前只告警不致命）。`sharp@0.35` 是 **N-API** 预编译产物（跨 Node/Electron ABI 稳定，Electron 下无需 rebuild）；`embedded-postgres` 是纯 JS + 平台二进制，无 ABI 约束。因此唯一风险点是 Electron 内置 Node 的**版本号**，用 M0 预检硬门禁 + `PAPERCLIP_DESKTOP_NODE_BIN` 一行兜底开关覆盖（见 §3.2） |
| 移动方案 | **Capacitor**。首发模式 A：`server.url` 指向自托管 Paperclip（同源，Cookie / WebSocket / Service Worker 全部原生可用）；模式 B：内置 `ui/dist` + 注入式 shim（离线壳），作为后续可选阶段 |
| 桌面数据目录 | 独立实例：`PAPERCLIP_HOME=<userData>/paperclip`，`PAPERCLIP_INSTANCE_ID=desktop`，**不写 `~/.paperclip`**，与 CLI 实例互不干扰 |
| 新模块位置 | ✅ **已实现为独立仓库** `~/pix/paperclip-shell`（含 `desktop/`、`mobile/`），**不放在 paperclip 内**，可独立演进 |
| 非侵入式验证 | ✅ 实现全过程 `paperclip` 仓库 `git status --porcelain` **为空**（连 `dm.md` 也已随你上一次提交进入仓库，本轮未再改动其他文件） |

> **实现状态**：M0 / M1 / M2 / M5（模式 A）已实现并**真实验证通过**；M3 的**自动更新**与 M4 的**托盘 / 关于页 / 日志导出**也已实现，并在**打包产物**上真实验证通过（4/4），详见 §12。计划中少数条目在实现时被替换（staging 方式、打包复制方式、更新通道形态等），原因与替代方案同样记录在 §12.2。

---

## 1. 非侵入式约束（可做 / 不可做）

**允许**
- ✅ 实际落点：**独立仓库** `~/pix/paperclip-shell`（`desktop/**`、`mobile/**`、`docs/**`、`README.md`、`.gitignore`），paperclip 内**零新增文件**
- 在该仓库内使用**自己的** `package.json`、锁文件、构建脚本
- 以「调用者」身份复用现有脚本：`pnpm --filter @paperclipai/ui build`、`pnpm --filter @paperclipai/server build`（构建产物 `ui/dist`、`server/dist` 属 gitignore 的构建输出）
- 复用现有发布辅助函数：`scripts/prepare-bundled-package.mjs` 的 `materializePublishManifest` / `applyBundledDependencyPatches`（只读导入）

**禁止**
- 修改 `ui/`、`server/`、`cli/`、`packages/**` 下任何现有文件
- 修改 `pnpm-workspace.yaml`、root `package.json`、`pnpm-lock.yaml`、`tsconfig.json`、`.github/workflows/**`
- 让新模块成为现有包的依赖（否则会改现有 `package.json`）

**连带约束（重要，来自现有仓库门禁）**
- `scripts/check-node-version-policy.mjs` 遍历**全仓库** `package.json` 并要求 `engines.node: ">=24.11.0"` + `@types/node: "^24.0.0"`。新仓库独立后不再被该门禁扫描，但两个 `package.json` **仍然按该规范声明**（保持一致性，便于将来并入 workspace）。
- `scripts/check-forbidden-tokens.mjs` 扫描工作区，新文件不得包含本机用户名等敏感 token。
- `scripts/check-module-boundaries.mjs` 只扫描 `server/src`，独立仓库不受影响。

---

## 2. 代码库分析（现状事实）

### 2.1 运行时拓扑

```
┌──────────────┐   静态资源    ┌───────────────────────────┐
│  ui/ (Vite)  │ ───────────▶ │ server/ (Express 5 + WS)   │
│  React 19 SPA│  ui-dist      │  · /api/**                 │
└──────────────┘               │  · /api/live-events (WS)   │
                               │  · 静态 SPA + SPA fallback │
                               │  · embedded-postgres       │
                               └───────────────────────────┘
                                          │
                                    cli/ (paperclipai)
```

- 服务入口：`server/src/index.ts:209 startServer()`；监听 `server/src/index.ts:1029`；端口默认 `3100`（`server/src/config.ts:362`），启动前用 `detect-port` 找空闲端口（`server/src/index.ts:701`），并把实际端口写入 `PAPERCLIP_LISTEN_PORT`（`:988`）。
- 数据/配置目录：`PAPERCLIP_HOME` 环境变量覆盖（`packages/shared/src/home-paths.ts:17`），实例隔离用 `PAPERCLIP_INSTANCE_ID`；默认在 `~/.paperclip/instances/<id>`。
- 数据库：`embedded-postgres`（18.1.0-beta.16），平台二进制通过可选依赖 `@embedded-postgres/<platform>` 分发（本机可见 `node_modules/@embedded-postgres/darwin-arm64`）。
- 迁移：非交互启动需 `PAPERCLIP_MIGRATION_PROMPT=never` + `PAPERCLIP_MIGRATION_AUTO_APPLY=true`（`server/src/index.ts:262-263`），否则陈旧 schema 会拒绝启动（`:309`）。
- 部署模式：`local_trusted`（默认）要求 `server.bind=loopback` 且 `exposure=private`（`packages/shared/src/network-bind.ts:45`、`config-schema.ts:145`），**该模式下不需要登录**（`server/src/middleware/auth.ts:245`）——这是桌面端「开箱即用」的关键。

### 2.2 前端

- 构建：`ui/vite.config.ts`，产物 `ui/dist`；`scripts/prepare-server-ui-dist.sh` 会把它复制成 `server/ui-dist` 供发布包自包含。
- 路由：`ui/src/main.tsx` 使用 `BrowserRouter`（来自 `@/lib/router`，即 `react-router-dom` 的包装，含公司前缀重写）。**需要真实 HTTP 服务端**（`file://` 下会失效）——这决定了桌面端必须走本地 HTTP 服务，而不是 `loadFile`。
- API 客户端：`ui/src/api/client.ts:5` **硬编码** `const BASE = "/api"`，且 `credentials: "include"`（`:56`）。移动端「离线壳」模式下这是唯一的兼容难点（见 §7.4）。
- 实时：WebSocket（`server/src/realtime/live-events-ws.ts:241`），`vite-api-proxy` 已开 `ws: true`。
- PWA：`ui/public/sw.js` + `ui/src/lib/service-worker-updates.ts`（注册 + 更新检测）。
- 移动适配**已存在**：`DESIGN.md:144` 描述了移动端任务面板、安全区、44px 触控 token；root `package.json` 有 `dev:mobile`（构建 UI 后用 `vite preview` 在 :3101 供手机浏览器访问）。

### 2.3 原生依赖（决定「不能交叉打包」）

| 依赖 | 形态 | 影响 |
|---|---|---|
| `sharp@^0.35.4`（`server/package.json:110`） | 平台+ABI 预编译 | 必须按目标平台安装 |
| `embedded-postgres` + `@embedded-postgres/<platform>` | 平台二进制 | 必须按目标平台安装 |
| `ssh2`, `ws` | 纯 JS（可选 native） | 无影响 |
| `bundleDependencies`（acpx、chat-adapter 等，`server/package.json`） | 发布包内自带 | 消费发布包时无需额外处理 |

→ **构建矩阵必须是 mac(arm64/x64) / win(x64) / linux(x64) 各自构建**，不能一份产物通吃。

### 2.4 现有发布与打包基建（可直接复用）

- `scripts/release-package-map.mjs` 的 roots 含 `server`、`ui`、`cli` → `@paperclipai/server` 是**已发布 npm 包**，且其 `prepack` 会构建并携带 `ui-dist`（`server/package.json`）。
- `Dockerfile` 的生产阶段（`Dockerfile:166-189`）证明「把构建后的整棵 `/app` 搬进 `node:24` 镜像」是可用的自包含模式。
- `pnpm-workspace.yaml` 里 `patchedDependencies` 包含 `embedded-postgres@18.1.0-beta.16` 的补丁 → **用 `npm install` 消费发布包不会应用该补丁**，必须走 pnpm 路径（见 §5.3）。
- pnpm 版本锁定 `pnpm@9.15.4`（root `package.json:111`）。

---

## 3. 关键技术决策

### 3.1 桌面壳选型

| 方案 | 优点 | 致命问题 | 结论 |
|---|---|---|---|
| **Electron** | Node 生态原生、主进程可直接 spawn/管理 sidecar、`electron-builder` 成熟（签名/公证/更新/多平台） | 体积大（~150MB 壳） | ✅ **采用** |
| Tauri | 壳小、Rust 安全 | 服务端仍是 Node 进程，必须额外塞 Node sidecar；macOS 公证 + 多进程管理更复杂；团队栈是 TS | ❌ |
| NW.js | 与 Electron 类似 | 生态与更新机制弱于 electron-builder | ❌ |
| 纯浏览器 + 本地服务 | 零打包 | 不是「桌面应用」，无托盘/开机自启/更新 | ❌ |

### 3.2 服务进程模型（已决策：复用 Electron 内置 Node）

**采用方案 B**：桌面主进程以 `ELECTRON_RUN_AS_NODE=1` spawn `process.execPath` 执行 `server/dist/index.js`。

```
spawn(process.execPath, [<resources>/server/dist/index.js], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...§5.1 的服务端 env },
  stdio: ["ignore", "pipe", "pipe"],
})
```
- 独立子进程（不是 in-process import）：服务端崩溃不拖垮 UI，退出时可 SIGTERM 优雅关闭。
- 省掉一份 ~50MB 的 Node 运行时，包体更小。

**为什么这个选择是安全的（逐项核对）**

| 依赖 | 机制 | 是否受 Electron 影响 |
|---|---|---|
| `sharp@^0.35.4` | 0.33+ 起为 **N-API** 预编译（`@img/sharp-<platform>`），N-API 跨 Node/Electron ABI 稳定 | ✅ 无需 rebuild |
| `embedded-postgres` + `@embedded-postgres/<platform>` | 纯 JS 包装 + 平台 `postgres` 二进制，走 `child_process` | ✅ 无 ABI 约束 |
| `ws`、`ssh2`（可选 native）、`better-auth` | 纯 JS 或 N-API | ✅ |
| Node 版本号 | 服务端 `warnIfUnsupportedNodeVersion` **只告警不致命**（`packages/shared/src/node-version.ts`） | ⚠️ 唯一风险点 → 见下 |

**M0 硬门禁（构建期，失败即终止打包）**
```
1. 读取 electron 依赖解析出的 Node 版本：<electron> -p "process.versions.node" （ELECTRON_RUN_AS_NODE 下）
   要求 >= 24.11.0，否则 fail（除非显式设置 PAPERCLIP_DESKTOP_ALLOW_OLD_NODE=1）
2. 用该运行时 require 关键原生依赖：node -e "require('sharp'); require('embedded-postgres')"
3. 用该运行时执行 server 启动冒烟（§6 M0）
```

**一行兜底开关（保留但不默认启用）**
- `server-supervisor.ts` 支持 `PAPERCLIP_DESKTOP_NODE_BIN=<path>`：设置后改为 spawn 该 Node 二进制（即退回「内置 sidecar」）。
- 若未来某个 Electron 大版本的 Node 落后于 `MINIMUM_NODE_VERSION`，只需在打包脚本里塞一个 Node 24 运行时并设此变量，**无需重构**。

**其他方案对比（记录取舍）**

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 内置官方 Node 24 运行时 sidecar | 兼容性最保险，+~50MB | ⏸ 作为兜底保留（`PAPERCLIP_DESKTOP_NODE_BIN`） |
| B. `ELECTRON_RUN_AS_NODE` 复用内置 Node | 省运行时、版本风险由 M0 门禁兜住 | ✅ **采用** |
| C. 直接加载 `server/dist-runtime/index.mjs`（esbuild bundle） | `bundle-runtime.mjs` 把第三方依赖全部 external，**仍需要完整 node_modules** | ⚠️ 可选优化，不采用 |
| D. 只做「远程 URL 壳」 | 最省事 | ❌ 不满足「本地可用」目标（仅作内测 fallback） |

**注意**：`ELECTRON_RUN_AS_NODE` 下 `process.versions.electron` 仍存在，少数库会据此改变行为（如自更新、原生对话框）。服务端依赖树中未发现此类用法，但 M0 冒烟必须覆盖「真实业务路径」（建公司 + 发消息），而不只是 `/api/health`。

### 3.3 服务端依赖 staging（⚠️ 计划被实现替换，见 §12.2）

| 方案 | 补丁生效 | 自包含 | 结论 |
|---|---|---|---|
| `pnpm deploy --filter @paperclipai/server --prod <staging>` | ✅（尊重 `patchedDependencies`） | ✅ | ❌ **实测不可用**：pnpm 9.15.4 会针对**过滤后的子图**校验 `patchedDependencies`，因仓库里 `acpx@0.12.0` 补丁条目在子图中不存在而硬失败（`ERR_PNPM_PATCH_NOT_APPLIED`） |
| `npm install @paperclipai/server@<ver>`（registry 版） | ❌ | ✅ | ❌ 三个 workspace 包（adapter-kimi-local / hermes adapter / plugin-sdk）未发布该版本；且与本地构建存在漂移 |
| 直接拷贝仓库根 `node_modules` | ✅ | ✅ 但 2.3G（含 devDeps） | ❌ 体积不可接受 |
| ✅ **实际采用：`pnpm pack` 本地 workspace 闭包 → `npm install file:*.tgz` → 复用仓库补丁函数** | ✅ | ✅ | ✅ **已实现并通过验证**（§12.2） |

### 3.4 移动端形态

| 模式 | 做法 | 优点 | 缺点 | 定位 |
|---|---|---|---|---|
| **A. 远程服务模式** | `capacitor.config` 设 `server.url = https://<自托管 paperclip>` | 零改动、同源 Cookie/WS/SW 全可用、与桌面共享同一后端 | 需可达后端（局域网 / Tailscale / 公网） | ✅ **首发默认** |
| **B. 离线内嵌壳** | 内置 `ui/dist`，注入 shim 重写 `/api`、`/api/live-events`(WS)、`/assets` → 远端 base；原生网络走 `CapacitorHttp` | 秒开、可离线展示缓存、可上架 | 需处理 Cookie/SW/CORS 差异 | 第二阶段 |
| C. 移动端跑本地服务 | Capacitor 内起 Node | ❌ iOS 不允许 | — | 不采用 |

---

## 4. 模块设计（新增文件，零改动现有代码）

```
apps/                                  # 新增顶层目录，不在 workspace globs 内
├── desktop/
│   ├── package.json                   # engines.node>=24.11.0, @types/node ^24.0.0
│   ├── pnpm-lock.yaml                 # 独立锁文件（--ignore-workspace 安装）
│   ├── tsconfig.json
│   ├── electron-builder.yml           # mac/win/linux 目标、extraResources、签名、发布
│   ├── src/
│   │   ├── main.ts                    # 应用生命周期、单实例锁、菜单、托盘、更新
│   │   ├── server-supervisor.ts       # 定位/启动/健康检查/优雅关闭 sidecar
│   │   ├── paths.ts                   # 用户数据目录、日志目录、运行时路径解析
│   │   ├── first-run.ts               # 首次启动（迁移、初始化、错误面板）
│   │   ├── updater.ts                 # electron-updater 通道与提示
│   │   └── preload.ts                 # 最小暴露（版本号、打开外链、重启服务）
│   ├── scripts/
│   │   ├── build-server.mjs           # 调用现有 pnpm 脚本构建 ui + server（只读调用）
│   │   ├── stage-server.mjs           # pnpm deploy 到 apps/desktop/.stage/server
│   │   ├── preflight-runtime.mjs      # M0 门禁：Electron 内置 Node 版本 + 原生依赖加载
│   │   └── package.mjs                # 组装 + preflight + 调用 electron-builder
│   └── build/                         # 图标、entitlements.mac.plist、公证配置
├── mobile/
│   ├── package.json                   # Capacitor 依赖（独立安装）
│   ├── capacitor.config.ts
│   ├── scripts/build-web.mjs          # 模式 B：从 ../../ui/src 构建内嵌壳
│   ├── web-shim/                      # 注入脚本（fetch/XHR/WebSocket 重写、能力桥）
│   ├── ios/  android/                 # `npx cap add` 生成
│   └── resources/                     # 图标/启动图
└── shared-shell/                      # 桌面与移动共用的纯 TS 工具（日志、版本、URL 规则）
```

**为什么放 `apps/`**：`pnpm-workspace.yaml` 的 globs 是 `packages/*`、`packages/adapters/*`、`packages/plugins/*`、`server`、`ui`、`cli`。`apps/` 不被任何 glob 命中 → 不进入 workspace 图 → **root lockfile 零变更**，同时仍可 `pnpm --dir ../..` 反向调用现有构建脚本。

---

## 5. 桌面端详细设计

### 5.1 启动序列

```
app.whenReady()
 1. 单实例锁 (app.requestSingleInstanceLock) —— 第二个实例聚焦已有窗口
 2. 解析路径：userData = app.getPath('userData')
    · PAPERCLIP_HOME   = <userData>/paperclip          （数据/DB/日志/密钥，不写用户主目录）
    · PAPERCLIP_INSTANCE_ID = "desktop"
 3. 环境注入（全部通过 env，不改代码）：
    PAPERCLIP_MIGRATION_PROMPT=never
    PAPERCLIP_MIGRATION_AUTO_APPLY=true
    PAPERCLIP_DEPLOYMENT_MODE=local_trusted     # loopback + 免登录
    PAPERCLIP_BIND=loopback
    PAPERCLIP_PORT=0                            # 交由服务端 detect-port 选空闲端口
    NODE_ENV=production
 4. spawn(process.execPath, [<resources>/server/dist/index.js], {
      env: { ELECTRON_RUN_AS_NODE: "1", ...(§5.1 服务端 env) },
      stdio: ['ignore','pipe','pipe']  → 转发到 <userData>/logs/server.log
    })
    · PAPERCLIP_DESKTOP_NODE_BIN 已设置时改为 spawn 该 Node 二进制（兜底开关，见 §3.2）
    · 从 stdout 解析实际端口（同时兜底轮询 3100..3120）
 5. 健康检查轮询 GET http://127.0.0.1:<port>/api/health （超时 90s，含首次迁移）
 6. BrowserWindow.loadURL(http://127.0.0.1:<port>)   ← 复用服务端 SPA 托管
 7. 关闭：SIGTERM → 等待 ≤15s → SIGKILL；子进程随 app 退出（before-quit 保证）
```

要点：
- **端口 0 + 解析 stdout**：服务端 `detect-port` 会挑空闲端口并打印；桌面端不假设 3100（避免与用户自己的 CLI 实例冲突）。
- **local_trusted + loopback**：免登录开箱即用，且不对外暴露（符合 `config-schema` 校验）。
- 首屏失败 → 显示内置错误页（读取 `logs/server.log` 尾部 + 「复制日志 / 重试 / 打开数据目录」）。
- 菜单/托盘：显示状态（启动中/运行中/端口）、打开数据目录、查看日志、重启服务、检查更新。

### 5.2 打包产物布局（asar + extraResources）

```
Paperclip.app/Contents/Resources/
├── app.asar                     # Electron 主进程代码（压缩）
├── server/                      # ← extraResources，必须解包（真实文件系统）
│   ├── dist/  ui-dist/  skills/
│   └── node_modules/            # pnpm deploy 产物（含 patched embedded-postgres）
└── icons/…
```

- `asarUnpack` 无法覆盖可执行 + 原生 `.node` 的全部场景，**server 树一律放 extraResources**（Node 运行时由 Electron 自带，无需额外拷贝；启用兜底开关时才追加 `runtime/node/bin/node`）。
- macOS 需 `entitlements`：`com.apple.security.cs.allow-jit`、`allow-unsigned-executable-memory`、`disable-library-validation`（Node + 原生模块在 Hardened Runtime 下的必要条件）。
- 体积控制：`pnpm deploy --prod` 后删除 `**/*.map`、`**/test/**`、`**/docs/**`、`.d.ts`（可配置），预期压缩后 dmg ≈ 200–330MB（Electron 壳 + node_modules + Postgres 二进制；无额外 Node 运行时）。

### 5.3 staging 脚本（⚠️ 实际实现见 §12.2：`pnpm deploy` 被替换为 `pnpm pack` + `npm install file:`）

```bash
# apps/desktop/scripts/stage-server.mjs 逻辑
pnpm --dir <repoRoot> --filter @paperclipai/ui build            # 现有脚本
pnpm --dir <repoRoot> --filter @paperclipai/server build        # 现有脚本（tsc + 复制 assets）
pnpm --dir <repoRoot> --filter @paperclipai/server build:runtime # 可选：dist-runtime
pnpm --dir <repoRoot> --filter @paperclipai/server deploy --prod .stage/server
node apps/desktop/scripts/preflight-runtime.mjs                 # M0 门禁：Node 版本 + 原生依赖 + 启动冒烟
```
- `pnpm deploy` 会在 `.stage/server` 生成自包含 `node_modules`（**应用 patchedDependencies**）。
- 若 `pnpm deploy` 在当前 pnpm 版本下对 `files` 字段行为不符预期，回退方案：`npm install @paperclipai/server@<version>` + 对 `node_modules/embedded-postgres` 手动 `patch -p1`。
- 不需要下载 Node 运行时（复用 Electron 内置 Node）；仅当启用 `PAPERCLIP_DESKTOP_NODE_BIN` 兜底时才追加下载步骤。

### 5.4 更新与发布

- `electron-updater`，通道对齐现有发布体系：`stable`（对应 `releases/vYYYY.MDD.P.md`）、`canary`。
- 版本策略：桌面版本 = 内置服务版本 + 桌面修订号，例如 `0.3.1+desktop.1`；`app.getVersion()` 与 `/api/health` 版本一起展示在「关于」。
- 发布产物：`Paperclip-<ver>-arm64.dmg` / `-x64.dmg` / `-x64.exe`(nsis) / `-x64.AppImage`、`-x64.deb` + `latest*.yml` 更新元数据。
- 代码签名：macOS Developer ID + `notarytool`；Windows 需代码签名证书（否则 SmartScreen 警告）。**这是发布前必须由你提供凭据的环节**。

> **实现说明（2026-10-22 补齐）**：`electron-updater` 已按 **generic feed** 接入（`desktop/src/updater.ts`）。feed 地址来自环境变量 `PAPERCLIP_DESKTOP_UPDATE_URL`，或打包时由 `scripts/package.mjs` 写入 `Resources/app-update.yml`；**两者都没有时更新保持禁用**（自托管构建不应把用户指向别人的服务器），菜单里会说明原因。`autoDownload` 关闭，更新必须由用户确认后才下载；`autoInstallOnAppQuit` 打开。macOS 额外产出 zip 产物（`Paperclip-<ver>-<arch>-mac.zip`），因为 electron-updater 在 macOS 只能从 zip 应用更新；打包时同时写出 `release/latest-mac.yml`（含 zip 与 dmg 的 sha512/size）。验证方式见 §12.1。

### 5.5 桌面端已知风险点

| 风险 | 对策 |
|---|---|
| **Electron 内置 Node 版本低于 24.11.0** | M0 硬门禁在构建期拦截；已内置 `PAPERCLIP_DESKTOP_NODE_BIN` 一行兜底（塞 Node 24 运行时即可，无需重构） |
| `ELECTRON_RUN_AS_NODE` 下 `process.versions.electron` 被库误判 | M0 冒烟走真实业务路径（建公司 + 发消息 + WS），而非只看 `/api/health` |
| 杀软/系统对「Electron 内嵌 Node + 启动子进程」误报 | 正式签名 + 公证；不写临时目录执行；提供 zip 版 |
| 首次启动迁移耗时（embedded-postgres 初始化） | 启动画面 + 分阶段进度；健康检查超时 90s；失败给可操作错误 |
| 用户同时运行 CLI 实例 | 端口 0 + 独立 `PAPERCLIP_HOME`/instance id，互不干扰 |
| `sharp`/postgres 二进制缺失 | 打包后自检：`node -e "require('sharp')"` + `pg_ctl --version`，失败即构建失败（fail fast） |
| 代理/企业网络下载 Node 运行时 | 支持 `PAPERCLIP_DESKTOP_NODE_DIST` 指向本地缓存/镜像 |

---

## 6. 桌面端任务分解（M0–M4）

| 里程碑 | 交付物 | 验收标准（可执行） |
|---|---|---|
| **M0 可行性探针（关键路径）** | `scripts/preflight-runtime.mjs` + `scripts/probe.mjs` | ✅ **通过（7/7）**：Node 24.22.0 ≥ 24.11.0；sharp/libvips 8.18.7 在该运行时加载成功；staged server 在 `ELECTRON_RUN_AS_NODE` 下启动，内嵌 PostgreSQL 集群初始化成功；`/api/health` 200（`0.3.1+0.git.12b3c7b`）；SPA shell 返回；建公司；WS `/api/companies/:id/events/ws` 握手；建 issue；SIGTERM 优雅退出 |
| **M1 骨架 + dev 运行** | `main.ts`、`server-supervisor.ts`、`paths.ts`、`preload.ts` | ✅ **通过**：`PAPERCLIP_DESKTOP_SMOKE=1 node scripts/dev.mjs` → `PASS smoke: ui mounted (rootChildren=1)`；退出后无残留子进程 |
| **M2 macOS 打包** | `electron-builder.yml` + `package.mjs` | ✅ **通过**：产出 `Paperclip-0.3.1-arm64.dmg`（585MB）；**挂载 dmg 直接运行其中的 App** → server 启动 → UI 挂载（`rootChildren=1`）；17 个 postgres dylib 别名软链在打包后保留 |
| **M3 Win/Linux + 更新** | 目标配置 + updater | 🟡 **自动更新已实现并验证**（`src/updater.ts` + `scripts/verify-shell.mjs`）：`electron-updater` 接入 generic feed（`PAPERCLIP_DESKTOP_UPDATE_URL` 或打包时嵌入 `app-update.yml`），macOS 额外产出可被应用的 zip 产物（`Paperclip-0.3.1-arm64-mac.zip`），打包时生成 `release/latest-mac.yml`；`npm run verify` 对**打包产物**跑本地 HTTP feed，断言 `state=available`。⏳ **Win/Linux 产物仍未构建**（`nsis` / `AppImage` 配置就位，需在对应平台构建） |
| **M4 打磨** | 错误页、托盘、关于、日志导出 | ✅ **通过**：启动失败错误页 + 日志落盘 + 菜单；**托盘**（菜单栏图标 + 状态 + 打开数据/日志目录、导出日志、重启服务、检查更新、退出）、**About 页**（壳版本 + 服务端版本 + 服务地址 + Electron/Chromium/Node + 更新状态 + 数据/日志目录）、**日志导出**（单文件 bundle：诊断头 + 日志目录全部文件，每文件上限 5MB）全部实现，并在打包产物上断言通过（见 §12.1） |

---

## 7. 移动端（Capacitor）详细设计

### 7.1 基础配置

```ts
// apps/mobile/capacitor.config.ts（要点）
{
  appId: "ai.paperclip.app",
  appName: "Paperclip",
  webDir: "www",                 // 模式 B 使用；模式 A 下仅占位
  server: { url: process.env.PAPERCLIP_MOBILE_SERVER_URL, cleartext: true }, // 模式 A
  ios: { contentInset: "always", limitsNavigationsToAppBoundDomains: false },
  android: { allowMixedContent: true },
  plugins: { SplashScreen: {...}, StatusBar: {...}, Keyboard: { resize: "body" } }
}
```

### 7.2 原生能力清单（Capacitor 插件）

| 能力 | 插件 | 用途 |
|---|---|---|
| 安全区/状态栏 | `@capacitor/status-bar` + 现有 `viewport-fit=cover` | 刘海屏适配（`index.html` 已具备 viewport meta） |
| 键盘 | `@capacitor/keyboard` | 输入框不被遮挡 |
| 启动图 | `@capacitor/splash-screen` | 首屏体验 |
| 深链/外链 | `@capacitor/app` | 自定义 scheme 打开任务；外链走系统浏览器 |
| 本地存储 | `@capacitor/preferences` | 记住后端地址、上次公司/看板 |
| 网络感知 | `@capacitor/network` | 离线提示、恢复后重连 WS |
| 推送 | `@capacitor/push-notifications` | 任务完成/需要人介入（需后端 FCM/APNs 通道，见开放问题） |
| 分享/文件 | `@capacitor/share`、`@capacitor/filesystem` | 分享任务链接、下载产物 |
| 拍照上传 | `@capacitor/camera` | 附件 |
| 触感 | `@capacitor/haptics` | 触控反馈（对齐 DESIGN.md 的 44px 交互 token） |

### 7.3 模式 A（首发）：远程服务

- 用户在 App 内填写后端地址（局域网 / Tailscale / 公网 HTTPS），存 `Preferences`，`server.url` 生效后加载。
- 因为**同源**，现有 `BrowserRouter`、`credentials: include` Cookie、WebSocket、`sw.js` 全部按原样工作——**零前端改动**。
- 安全：强制 HTTPS（除显式开启「允许局域网明文」）；iOS ATS 例外仅在需要时按域名白名单开启。
- 认证：`local_trusted` 仅限 loopback，手机端必然走 `authenticated` 模式 + 设备登录（仓库已有 device-login 相关服务），计划中列入验收项。

### 7.4 模式 B（第二阶段）：内嵌壳

难点只有一个：`ui/src/api/client.ts` 的 `BASE = "/api"` 与 `BrowserRouter` 需要「真实 HTTP 源」。
**不改源码**的解法（在 `apps/mobile/scripts/build-web.mjs` 的自定义 Vite 配置里做）：

1. `root` 指向 `../../ui`，`publicDir` 复用，产物输出到 `apps/mobile/www`。
2. 自定义 Vite 插件 `transformIndexHtml` 注入 `web-shim/bootstrap.js`（在模块图之前执行）：
   - 包装 `window.fetch` / `XMLHttpRequest`：把以 `/api` 开头的相对 URL 重写到 `<serverBase>/api`（绝对 URL 不变）。
   - 包装 `WebSocket`：把 `/api/live-events` 重写到 `wss://<host>/api/live-events`。
   - 注册 `CapacitorHttp` 作为底层传输（原生网络栈，规避 CORS）。
   - 拦截 `navigator.serviceWorker.register` 失败 → 静默降级（避免 Capacitor 自定义 scheme 下的报错）。
   - 暴露 `window.PaperclipShell = { serverBase, platform, version }`。
3. Cookie 处理：`CapacitorCookies` 把 WebView Cookie 同步到原生网络层；若后端使用 Bearer/设备令牌，则用 `Preferences` 注入 `Authorization` 头（同样在 shim 内）。
4. 构建校验：产物中不得出现对现有源码的写操作；`git status` 仍只有 `?? apps/`。

### 7.5 移动端任务分解（M5–M6）

| 里程碑 | 交付物 | 验收 |
|---|---|---|
| **M5 模式 A 可用** | `mobile/` + iOS/Android 工程 + 连接页 | ✅ **通过（结构性 + 端到端）**：15 个 Capacitor 插件安装、`cap add ios` / `cap add android` / `cap sync` 成功、`doctor.mjs` 7/7 通过；端到端用 390×844 移动视口跑通「连接页 → 跳转服务端 → Paperclip UI 挂载 → 同源 `/api/health` 200」，截图存 `docs/evidence/mobile-mode-a.png`。**未验证**：真机/模拟器构建（需 Xcode 签名与 Android SDK） |
| **M6 模式 B + 原生能力** | `build-web.mjs` + shim + 插件接入 | ⏳ 未实现（计划内属第二阶段） |

---

## 8. 验证与测试矩阵

| 层级 | 命令 / 方法 | 通过标准 |
|---|---|---|
| 仓库门禁不受影响 | `node scripts/check-node-version-policy.mjs`、`node scripts/check-forbidden-tokens.mjs` | 退出码 0 |
| 非侵入式 | `git status --porcelain` | 仅 `?? apps/`、`?? dm.md` |
| 现有构建仍可用 | `pnpm -r build`（或 `pnpm --filter @paperclipai/ui build` + `server build`） | 成功 |
| 桌面 dev | `pnpm --dir apps/desktop dev` | 窗口出现、`/api/health` 200 |
| 桌面包 | 安装 dmg/nsis/AppImage 于**干净环境** | 首启可用；重启后数据保留；卸载不留残留进程 |
| 进程卫生 | 关闭应用后 `pgrep -f 'server/dist/index.js'` | 无输出 |
| 桌面壳功能（托盘/关于/日志导出/更新） | `cd desktop && npm run verify`（在**打包产物**上跑，本地 HTTP feed 供能） | `checks: 4 passed, 0 failed`；`npm run verify:dev` 形态下更新通道预期为 `disabled` |
| 移动 | 真机 iOS + Android 冒烟（模式 A） | 见 M5 验收 |
| 回归 | 现有 `pnpm test:run` 子集（server/ui 关键套件） | 与改动前一致（我们不改代码，应无差异） |

---

## 9. 风险登记

| # | 风险 | 影响 | 对策 |
|---|---|---|---|
| 1 | Electron 内置 Node 版本/ABI 不匹配 | 原生模块加载失败 | 采用**独立 Node 24 sidecar**（§3.2 A） |
| 2 | pnpm patch 未生效（embedded-postgres） | 数据库启动失败 | 走 `pnpm deploy`；staging 后校验补丁是否落地 |
| 3 | 平台二进制缺失（sharp/postgres） | 运行期崩溃 | 构建后自检（fail fast）；CI 分平台构建 |
| 4 | macOS 公证 / Hardened Runtime 阻止 spawn | 应用无法启动服务 | 正确 entitlements + 公证；提供未签名 zip 供内测 |
| 5 | 包体过大 | 分发体验差 | `--prod` staging + 清理 map/测试/类型文件；必要时按需裁剪 adapters |
| 6 | 端口/实例冲突 | 与 CLI 实例互相干扰 | 端口 0 + 独立 `PAPERCLIP_HOME` + 单实例锁 |
| 7 | 移动端 Cookie/ATS/CORS | 登录态丢失 | 模式 A 同源；模式 B 用原生 Cookie 同步 + 显式 CORS 白名单 |
| 8 | 后端能力（推送、设备登录）依赖服务端改动 | 移动端功能受限 | 列入开放问题；**不通过修改现有代码解决**，优先用现有 API/配置 |
| 9 | `apps/` 被误纳入 workspace 导致锁文件漂移 | 违反非侵入式 | 目录名不在 globs 内；CI 校验 `git status` 白名单 |
| 10 | 上游版本漂移（0.3.1 → 后续） | 桌面包落后 | staging 固定 `@paperclipai/server` 版本；发布流水线记录所用版本 |

---

## 10. 已决策 / 待决策

**已决策（本计划据此编写）**
1. ✅ 桌面运行时：**复用 Electron 内置 Node**（`ELECTRON_RUN_AS_NODE`），以 M0 门禁 + `PAPERCLIP_DESKTOP_NODE_BIN` 兜底覆盖版本风险。
2. ✅ 桌面数据目录：**独立实例** `PAPERCLIP_HOME=<userData>/paperclip` + `PAPERCLIP_INSTANCE_ID=desktop`。
3. ✅ 移动端首发：**模式 A（远程服务）**；模式 B（离线壳）降为后续可选阶段。

**仍待决策（不阻塞 M0–M2）**
4. 发布渠道：桌面/移动产物走 GitHub Releases，还是沿用现有 release registry？
5. 签名凭据：是否已有 Apple Developer ID / Windows 代码签名证书用于 CI？（无则可先出未签名内测版）
6. 推送通知：是否本轮接入（需要后端 FCM/APNs，属跨模块工作）？

---

## 11. 结论

- **最佳方案（已落地）**：独立仓库 `paperclip-shell` 内 `desktop/`（Electron 壳 + `ELECTRON_RUN_AS_NODE` 复用内置 Node 运行自包含 server + 复用 `server/ui-dist` 静态托管）与 `mobile/`（Capacitor，模式 A）。对 paperclip 仓库零改动。
- **成功判据（已达成）**：paperclip `git status` 为空；`Paperclip-0.3.1-arm64.dmg` 可挂载运行并渲染真实 UI；移动端连接流程端到端通过；桌面壳的托盘 / 关于页 / 日志导出 / 更新通道在**打包产物**上断言通过（§12.1）。
- **下一步**：M3 剩余的 Win/Linux 产物、M6（模式 B 离线壳）、以及 §12.4 的包体裁剪与签名发布。

---

## 12. 实现状态（Implementation Status）

> 实现落点：**独立仓库 `~/pix/paperclip-shell`**（`desktop/`、`mobile/`、`docs/evidence/`）。
> 验证时间：2026-10-21（§12.1 前六项）、2026-10-22（本轮补齐的托盘 / 关于页 / 日志导出 / 更新通道，§12.1 后三项）。
> paperclip 检出：`5d1b066d8`（`@paperclipai/server@0.3.1`，服务端版本 `0.3.1+0.git.5d1b066`）。
> 所有结论均来自实际执行输出，未通过项已明确标注。

### 12.1 已实现并通过真实验证

| 能力 | 文件 | 验证方式与结果 |
|---|---|---|
| 桌面运行时门禁 | `desktop/scripts/preflight-runtime.mjs` | `PASS runtime Node >= 24.11.0 — v24.22.0`；`PASS critical deps require() — 6 modules`；`PASS sharp native binding — libvips 8.18.7`；`runtime identity: node 24.22.0 / electron 44.9.2` |
| 服务端 staging（按 arch 分树） | `desktop/scripts/stage-server.mjs` | 打包 16 个 workspace 包 → `npm install` 643 包 → 补丁校验通过（`embedded-postgres patch: present`、`acpx@0.13.1 patch: present`、`platform postgres: initdb (PostgreSQL) 18.1`）；体积 1.5G → 裁掉 15,290 个 source map 后 1.4G。原生 arch 落在 `.stage/server`，交叉 arch 落在 `.stage/server-<arch>`（`PAPERCLIP_SHELL_TARGET_ARCH=x64` + `npm install --cpu=x64 --os=darwin`），两树各 1.4G/1.6G |
| 端到端探针 | `desktop/scripts/probe.mjs` | **7/7 通过**：`/api/health` 200（`0.3.1+0.git.12b3c7b`）→ SPA shell 8972B → `GET /api/companies` → `POST /api/companies`（写路径）→ WS 握手 → `POST /api/companies/:id/issues` → SIGTERM `exit=0` |
| Electron 壳 | `desktop/src/main.ts`、`server-supervisor.ts`、`paths.ts`、`preload.ts` | `PAPERCLIP_DESKTOP_SMOKE=1 node scripts/dev.mjs` → `PASS smoke: ui mounted (rootChildren=1)`；单实例锁、优雅关闭、失败错误页、菜单（打开数据/日志目录、重启服务） |
| macOS 安装包（arm64 + x64） | `desktop/electron-builder.yml`、`scripts/package.mjs` | `Paperclip-0.3.1-arm64.dmg`（585MB）与 `Paperclip-0.3.1-x64.dmg`（664MB）；两者均 `hdiutil attach` 后**从挂载卷直接运行** → `server ready on http://127.0.0.1:3187` → `PASS smoke: ui mounted (rootChildren=1)`；x64 包在 Apple Silicon 上经 Rosetta（`arch -x86_64`）运行通过；`server bundled (17 symlinks preserved)`；打包时自检包内 arch 与目标一致（`@embedded-postgres/darwin-{arm64,x64}`、`@img/sharp-darwin-{arm64,x64}`） |
| 移动端（模式 A） | `mobile/capacitor.config.ts`、`www/index.html`、`scripts/doctor.mjs` | `doctor.mjs` 7/7；`cap add ios` / `cap add android` / `cap sync` 成功；390×844 移动视口端到端：连接页 → 跳转 `http://127.0.0.1:3188/` → UI 挂载 → 同源 `/api/health` 200（截图 `docs/evidence/mobile-mode-a.png`） |
| **托盘 + 关于页 + 日志导出** | `desktop/src/tray.ts`、`about.ts`、`logs.ts`、`main.ts` | 在**打包产物**上跑 `npm run verify` → `PASS: tray: present and reflects the running server — phase=running server=http://127.0.0.1:3187`；`PASS: about: window renders version and server info — version=0.3.1 server=0.3.1+0.git.5d1b066`（About 窗口同时列出 Electron/Chromium/Node、更新状态、数据与日志目录）；`PASS: logs: export bundle written — …（1 files, 77267 bytes）`（诊断头 + 日志目录全部文件，每文件上限 5MB）；arm64 与 x64（Rosetta）产物**各 4/4 通过**；未打包形态 `npm run verify:dev` 亦 **4/4**（更新通道按预期为 `disabled`） |
| **自动更新（electron-updater）** | `desktop/src/updater.ts`、`scripts/package.mjs`、`electron-builder.yml` | `PASS: updater: check reaches available — state=available Update available`：本地 HTTP 服务器用**打包产物本身**（`Paperclip-0.3.1-arm64-mac.zip` + `release/latest-mac.yml`，版本号临时抬到 99.0.0）充当 generic feed，`electron-updater` 真实拉取并判定「有新版本」；macOS 目标新增 `zip`（electron-updater 在 macOS 只能从 zip 应用更新），打包时生成 `release/latest-mac.yml`、配置 `PAPERCLIP_DESKTOP_UPDATE_URL` 时把 feed 嵌入 `Resources/app-update.yml`；未配置 feed 时更新保持**禁用**（自托管构建不指向别人的服务器），`autoDownload` 关闭 |
| **打包产物回归** | `desktop/scripts/*` | 本轮改动后重跑：`npm run probe` **7/7 通过**（`0.3.1+0.git.5d1b066`）；`PAPERCLIP_DESKTOP_SMOKE=1 npm run dev` → `PASS smoke: ui mounted (rootChildren=1)` 且退出后无残留进程；arm64 dmg（585MB）与 x64 dmg（664MB）重新产出，arm64 dmg 挂载后直接运行 → `PASS smoke: ui mounted (rootChildren=1)` |
| 非侵入式 | — | `paperclip` 仓库 `git status --porcelain` **全程为空**（本轮仅按要求更新 `dm.md` 本身）；全部产物位于独立仓库 |

### 12.2 实现中的偏差（计划 → 实际，含原因）

| # | 计划 | 实际 | 原因 |
|---|---|---|---|
| 1 | 模块放 `paperclip/apps/` | 独立仓库 `~/pix/paperclip-shell` | 你的要求：单独包、不在 paperclip 下、独立演进 |
| 2 | `pnpm deploy --prod` staging | `pnpm pack`（16 个 workspace 包）→ `npm install file:*.tgz` → 复用 `applyBundledDependencyPatches` | `pnpm deploy` 在 pnpm 9.15.4 下按**过滤后子图**校验 `patchedDependencies`，仓库里 `acpx@0.12.0` 补丁在子图中不存在 → `ERR_PNPM_PATCH_NOT_APPLIED` 硬失败 |
| 3 | 直接用 `pnpm --filter … build` | 前置注入 `node_modules/.bin` 到 `PATH` | 本机 `pnpm run` 的 PATH 未包含 workspace `.bin`，导致解析到 **Homebrew 全局 vite** 并因缺 `esbuild` 失败 |
| 4 | `npm install` 即可 | 需 `--legacy-peer-deps` | npm 10.9.9 arborist 在该图上 `#loadPeerSet` 崩溃：`Cannot read properties of null (reading 'edgesOut')` |
| 5 | —（未预见） | staging 后需手动执行 `@embedded-postgres/<platform>` 的 `hydrate-symlinks.js` | npm 跳过了该 optional 依赖的 postinstall，导致 ICU dylib 别名软链缺失，`initdb` 报 `Library not loaded: libicudata.77.dylib` |
| 6 | `extraResources` 携带 server 树 | 打包脚本自行 `ditto` 复制 | electron-builder 默认忽略列表硬编码 `!**/node_modules/**`，会**静默丢弃** server 的运行时依赖（首次产物只有 111MB，缺 `node_modules`） |
| 7 | `electron-builder --mac`（yml 内多 arch） | 每 arch 单独一轮 dir → copy → `--prepackaged` | `--prepackaged` 会忽略 arch 参数并展开 yml 的 arch 列表，导致 `-x64.dmg` 里装的其实是 arm64 包 |
| 8 | 一棵 stage 树同时供两个 arch | 每 arch 一棵树（`.stage/server` / `.stage/server-x64`）+ 每 arch 独立 preflight | `sharp`、`@embedded-postgres/<platform>` 是单架构二进制，一棵树无法同时喂两个 arch；且 release/ 会累积多个 arch 的 app 目录，需按构建时间过滤，否则**旧 arch 的 app 会被注入新 arch 的 server 树** |
| 9 | `PAPERCLIP_SHELL_SKIP_INSTALL=1` 复用时照常重跑补丁 | 复用树跳过 `applyBundledDependencyPatches` | 仓库 helper 用 `patch --forward`，当全部 hunk 已应用时退出码为 1（实测 `4 out of 4 hunks ignored`）而硬失败；复用树本就已打过补丁，改由既有的 marker 校验（`embedded-postgres patch: present`、`acpx@<ver> patch: present`）证明 |
| 10 | macOS 只产出 dmg | dmg **+ zip**（`Paperclip-<ver>-<arch>-mac.zip`） | electron-updater 在 macOS 只能从 zip 应用更新；dmg 仍是用户手动安装的产物 |
| 11 | 托盘图标直接用 app 图标 | 单独的模板图 `build/trayTemplate.png`（由 `build/tray.svg` 生成，作为 extraResource 打进 `Resources/`） | 菜单栏模板图必须是「黑像素 + alpha」的 16/32pt 配对，用彩色 app 图标在深色/浅色菜单栏下都不可读 |
| 12 | 图标生成脚本每个图标新建一个窗口 | `scripts/make-icons.cjs` 复用同一个窗口 | Electron 中「销毁后新建第二个 BrowserWindow」会让后续所有 `loadURL(data:…)` 失败（`ERR_FAILED (-2)`），托盘图标因此一直生成不出来 |
| 13 | 直接打包 `electron-updater` | esbuild 加 banner 注入 `createRequire` | `electron-updater` 及其 `fs-extra` 依赖链是 CommonJS 且用动态 `require("fs")`，打进 ESM 主进程会抛 `Dynamic require of "fs" is not supported` |
| 14 | staging 只复制 `server/` 下的技能 | 同时复制仓库根的 `skills/` 与 `skills-releases/` | 服务端从 `<serverRoot>/skills`（仓库根目录，不是 `server/`）读取内置技能，缺失时公司技能目录为空，agent 选择内置技能报 `Invalid company skill selection (unknown references: paperclipai/…)` |
| 15 | 直接继承进程 `PATH` | 启动前用登录 shell（`$SHELL -ilc`）解析 PATH 并合并回退目录 | 从 Finder/Dock 启动的 app 只有 `PATH=/usr/bin:/bin:/usr/sbin:/sbin`，服务端解析不到用户装的 agent CLI（`claude`、`codex` 等），报 `Command not found in PATH`；可用 `PAPERCLIP_DESKTOP_PATH` 覆盖 |
| 16 | 更新通道由代码写死 | 由 `PAPERCLIP_DESKTOP_UPDATE_URL` / 打包时嵌入的 `app-update.yml` 决定 | 自托管构建不应把用户指向别人的服务器；未配置时更新保持禁用（菜单里给出原因） |
| 17 | 验证脚本按「PASS 行数 / 退出码」判定 | 额外要求 app 自己打印 `[verify] N/M checks passed` | 壳在报告前崩溃（打包错误、启动崩溃）时退出码同样是 0，旧判定会给出「0 passed, 0 failed」却返回成功（实测过一次）；现在缺该汇总行即判失败 |

### 12.3 已验证的关键风险（计划 §9 的实测结论）

- **风险 1（Electron 内置 Node 版本）**：**不成立**。Electron 44.9.2 内置 Node **24.22.0** ≥ 24.11.0；`sharp` 的 N-API 产物与 `embedded-postgres` 在该运行时下均正常。兜底开关 `PAPERCLIP_DESKTOP_NODE_BIN` 保留但未启用。
- **风险 2（pnpm patch 未生效）**：以另一路径规避（§12.2 #2），并**显式校验** `globalThis.process.env` 标记存在。
- **风险 3（平台二进制缺失）**：通过构建后自检覆盖（`initdb --version` 必须成功，否则构建失败）。
- **风险 5（包体过大）**：**成立且未解决**。App 1.7G / dmg 585MB（arm64）、664MB（x64），主要来自 agent 运行时二进制（`@openai` 258M、`@anthropic-ai` 208M、`@github` 146M、`@embedded-postgres` 145M、`opencode-darwin-arm64` 138M）。裁剪方案见 §12.4。

### 12.4 未完成 / 后续（明确不在本轮范围内）

1. **Windows / Linux 产物**：需在对应平台构建（平台二进制不可交叉打包）；`nsis` / `AppImage` 配置已就位。（macOS **arm64 + x64 均已产出并验证**，见 §12.1。）
2. **更新的“真实发布”环节**：更新通道本身已实现并验证（§12.1），但仍需 ①一个实际托管 feed 的地址（`PAPERCLIP_DESKTOP_UPDATE_URL` 或 `app-update.yml`）；②签名与公证（见下条）；③Windows/Linux 的对应 yml（`latest.yml` / `latest-linux.yml`）随对应平台产物一起生成。
3. **代码签名与公证**：当前为未签名本地构建（`identity: null`）；发布需 Apple Developer ID + `notarytool`、Windows 代码签名证书。
4. **包体裁剪**：按 adapter 拆分为可选下载（例如把 copilot/opencode/codex/claude 运行时做成按需安装），或首启下载；这是把 dmg 从 585MB 压到 ~200MB 的主要手段。
5. **移动端真机**：iOS 需 Xcode 签名（`pod install` / 归档），Android 需 Android SDK；当前仅验证到 `cap sync` + WebView 级端到端。
6. **移动端原生能力**：15 个插件已安装并同步，但尚未在 UI 中调用（模式 A 下 UI 不做改动，插件能力需模式 B 或后续接入）。
7. **首次启动迁移耗时**：首次启动需应用 353 个迁移（实测内嵌 Postgres 集群初始化 + 迁移可接受），启动页已按 server 日志分阶段显示进度，仍建议加更细的百分比。
8. ~~托盘 / 关于页 / 日志导出~~ → **已实现并验证**（§12.1）。

### 12.5 复现命令

```bash
cd ~/pix/paperclip-shell/desktop
npm install
PAPERCLIP_REPO=~/pix/paperclip npm run stage        # 构建 ui+server，pack+install 出可运行 server 树
PAPERCLIP_REPO=~/pix/paperclip npm run preflight    # 运行时门禁
PAPERCLIP_REPO=~/pix/paperclip npm run probe        # 端到端 7 项检查
PAPERCLIP_DESKTOP_SMOKE=1 npm run dev               # 启动窗口并断言 UI 挂载
PAPERCLIP_REPO=~/pix/paperclip npm run package:mac  # 产出当前 arch 的 dmg

# 两个 arch 都出（各需一棵 stage 树，每棵约 1.5G）
PAPERCLIP_SHELL_TARGET_ARCH=x64 PAPERCLIP_REPO=~/pix/paperclip npm run stage
PAPERCLIP_REPO=~/pix/paperclip npm run package:mac:both   # -> release/Paperclip-0.3.1-{arm64,x64}.dmg

# 已装好的树复跑 staging（省掉约 11 分钟的跨架构 npm install）
PAPERCLIP_SHELL_SKIP_BUILD=1 PAPERCLIP_SHELL_SKIP_PACK=1 PAPERCLIP_SHELL_SKIP_INSTALL=1 \
  PAPERCLIP_REPO=~/pix/paperclip npm run stage

# 从挂载卷直接验证产物（x64 在 Apple Silicon 上走 Rosetta）
hdiutil attach release/Paperclip-0.3.1-x64.dmg -nobrowse -readonly
PAPERCLIP_DESKTOP_SMOKE=1 arch -x86_64 "/Volumes/Paperclip 0.3.1/Paperclip.app/Contents/MacOS/Paperclip"

# 托盘 / 关于页 / 日志导出 / 更新通道（在打包产物上跑；会起一个本地 feed 服务）
npm run verify                # -> checks: 4 passed, 0 failed
npm run verify:dev            # 未打包形态：更新通道预期为 disabled
PAPERCLIP_VERIFY_APP="$PWD/release/mac/Paperclip.app/Contents/MacOS/Paperclip" npm run verify   # 验证 x64 产物

# 产出带更新通道的产物（会写 release/latest-mac.yml 并把 feed 嵌入 app-update.yml）
PAPERCLIP_DESKTOP_UPDATE_URL=https://paperclip.example.com/updates npm run package:mac

cd ~/pix/paperclip-shell/mobile
npm install && npm run add:ios && npm run add:android && npm run sync
npm run doctor
```
