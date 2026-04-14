# CLI、开发与部署

## 1. CLI 的角色

很多人第一次看仓库时会把 CLI 当成附属工具，但实际上 `cli/` 是 Paperclip 使用体验的重要组成部分。它负责把“如何配置、如何启动、如何排障、如何做 worktree 隔离”这些本来很繁琐的事情统一起来。

主要入口是：

- `cli/src/index.ts`

核心命令分布在：

- `cli/src/commands/`
- `cli/src/checks/`
- `cli/src/prompts/`

## 2. CLI 解决的核心问题

当前 CLI 已经覆盖了几类关键流程：

### Onboard

把首次安装、配置 server/database/storage/secrets 等流程做成可交互上手。

### Doctor

做环境和配置体检，检查：

- 数据库
- 路径
- 日志
- LLM key
- 部署模式
- secret 设置
- 存储设置

### Run

一键完成本地运行所需的前置步骤，然后启动服务。

### Worktree

为多个 git worktree 准备隔离实例，这一点对于并行开发和 PR review 很重要。

### Auth / Routine / Backup

CLI 还提供 bootstrap CEO、routines、数据库备份等运维能力。

## 3. 开发模式

顶层 `package.json` 已经把常用开发命令组织好了：

- `pnpm dev`
- `pnpm dev:once`
- `pnpm dev:server`
- `pnpm dev:ui`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test:run`
- `pnpm db:generate`
- `pnpm db:migrate`

其中：

- `pnpm dev` 通过 dev runner 协调 server 与 UI 的开发体验
- `pnpm dev:once` 偏向一次性稳定启动

## 4. 嵌入式 PostgreSQL

Paperclip 的一个很强的本地优先特性，是默认自动使用嵌入式 PostgreSQL。只要不设置 `DATABASE_URL`，server 启动时就会：

- 准备本地数据目录
- 启动 embedded postgres
- 检查/应用迁移

这大幅降低了本地开发和试用门槛，也是它“本地先跑起来再说”体验的关键。

## 5. 部署模式

当前系统支持两大运行模式：

- `local_trusted`
- `authenticated`

其中 `authenticated` 还分：

- `private`
- `public`

可以粗略理解为：

- 本地单人低摩擦使用：`local_trusted`
- 私网或公网部署：`authenticated`

这套模式设计的目标不是做复杂权限模型，而是兼顾本地易用性和线上安全边界。

## 6. Dev Runner 与自动重启

Paperclip 自己实现了一套 dev runner，用来：

- 构建 plugin SDK
- 启动后端子进程
- 扫描后端相关文件变化
- 标记 restart required
- 在可安全的条件下自动重启 dev server

这也是为什么仓库里会有：

- `scripts/dev-runner.ts`
- `server/src/dev-server-status.ts`
- `ui/src/components/DevRestartBanner.tsx`

这一整套与开发时“何时该重启”相关的代码。

## 7. Worktree 支持说明了什么

Paperclip 非常重视 worktree 隔离，因为它自己就是一个复杂仓库，也会被用来做多线程、多任务开发。因此 CLI 中针对 worktree 的命令不只是 git 辅助，而是会一起管理：

- repo-local 配置
- 独立实例目录
- 独立数据库端口
- 数据种子复制
- git hook 镜像

这表明开发者体验被视为产品的一部分。

## 8. 生产与云侧含义

尽管 Paperclip 很强调本地优先，但代码也已经为更接近生产的运行场景做了铺垫：

- 可接外部 PostgreSQL
- 支持 `authenticated` 模式
- 支持 S3 存储
- 支持插件和第三方接入
- 支持队列化作业和后台调度语义

当前更合理的理解是：它已经是“本地很成熟、云侧逐步演进”的产品，而不是纯本地玩具。

## 9. 新同学上手建议

如果你要真正在本仓库里开发，推荐顺序：

1. `pnpm install`
2. `pnpm dev`
3. 打开 `http://localhost:3100`
4. 阅读 `doc/DEVELOPING.md`
5. 再读 `cli/src/commands/onboard.ts`、`doctor.ts`、`worktree.ts`

这样你会同时理解：

- 产品怎么跑起来
- 代码如何帮助用户跑起来

这两者对理解 Paperclip 同样重要。
