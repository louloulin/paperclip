# 架构总览

## 1. Monorepo 结构

Paperclip 是一个以 pnpm workspace 组织的 monorepo。顶层 `package.json` 负责统一开发、构建、测试和数据库命令，核心运行单元分散在几个一级目录中：

- `server/`
  Express 后端，是真正的控制平面宿主。
- `ui/`
  React + Vite 前端控制台。
- `cli/`
  `paperclipai` 命令行工具。
- `packages/db/`
  Drizzle schema、迁移和数据库客户端。
- `packages/shared/`
  共享类型、常量、校验器、API 常量、部分 telemetry 工具。
- `packages/adapters/*`
  各种 agent adapter 的实现。
- `packages/adapter-utils/`
  多 adapter 共享的实用工具。
- `packages/plugins/sdk/`
  插件作者使用的官方 SDK。
- `packages/mcp-server/`
  面向 MCP 的 Paperclip API 包装层。

## 2. 系统分层

从整体看，Paperclip 可以分成五层：

### 第一层：产品与控制台层

用户直接看到的是 `ui/` 提供的 board UI。它是董事会、操作者和管理者的主入口，用来查看公司状态、管理任务、审批、成本和插件。

### 第二层：控制平面服务层

`server/` 是整个产品的核心。它既托管 REST API，也托管 dev 模式下的 UI，并负责：

- 认证与 actor 识别
- 公司级访问控制
- 路由与服务层装配
- heartbeat 调度与恢复
- 审批、预算、活动日志
- 插件 worker 管理
- 文件/对象存储

### 第三层：数据与约束层

`packages/db/` 和 `packages/shared/` 共同构成 Paperclip 的约束层：

- `db` 定义“真实存什么”
- `shared` 定义“外部如何理解这些对象和接口”

这两个包决定了 server、ui、cli、adapter 之间的契约一致性。

### 第四层：执行接入层

Adapter 层负责把外部 agent runtime 接进来。Paperclip 本身不实现 Claude/Codex/OpenClaw 的能力，而是通过统一适配面调用它们。

### 第五层：平台扩展层

Plugin SDK、MCP Server、CLI 共同把 Paperclip 从一个应用扩展成了平台：

- CLI 解决安装、检查、worktree、运维问题
- MCP Server 把 REST API 暴露成 MCP 工具
- Plugin 系统允许外部能力植入宿主

## 3. 运行时装配关系

核心启动流程在 `server/src/index.ts` 和 `server/src/app.ts`：

1. 读取配置
2. 检查运行模式与数据库
3. 在本地默认模式下启动嵌入式 PostgreSQL
4. 自动迁移或校验迁移状态
5. 创建 Express app
6. 挂载 API、认证、插件系统、UI 托管
7. 启动 WebSocket、调度器、反馈导出、插件工具分发等后台能力

这说明 Paperclip 当前是“一个后端宿主进程 + 可选 UI 静态资源/中间件”的架构，而不是拆成多个独立微服务。

## 4. 本地优先架构

Paperclip 当前非常强调 local-first：

- 未设置 `DATABASE_URL` 时自动用嵌入式 PostgreSQL
- dev 模式下 UI 和 API 同源运行
- 本地默认就是 `local_trusted`
- 通过 CLI 自动帮用户完成 onboard、doctor、run

这解释了为什么仓库中有很多与“低门槛安装”和“单机运行”有关的代码，而不是一开始就面向云原生集群。

## 5. 代码中的三个重要横切关注点

### 公司隔离

Company 是几乎所有业务的边界。读代码时，只要涉及核心实体，都要先问一句：这是否被正确 company-scoped 了？

### 治理

审批、预算、活动日志不是附属功能，而是核心设计原则。许多服务在做业务操作时都会顺手写 activity log 或检查 budget / approval 状态。

### 扩展性

Paperclip 从结构上避免把 adapter 或 plugin 逻辑直接焊死在主服务里。这也是仓库中 registry、loader、lifecycle、worker manager 很多的原因。

## 6. 如何从架构角度理解这套代码

一个简化的口径是：

- `ui/` 负责看和管
- `server/` 负责编排和治理
- `db/shared/` 负责契约和状态
- `adapters/` 负责连接 agent runtime
- `plugins/`、`mcp-server/`、`cli/` 负责扩展和集成

如果你能记住这条分工线，后面读具体代码会轻松很多。
