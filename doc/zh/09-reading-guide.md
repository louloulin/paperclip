# 代码阅读路径

## 1. 为什么需要阅读路径

Paperclip 不是一个单文件项目，也不是只有一个后端服务。它同时包含：

- server
- ui
- cli
- db
- shared
- adapters
- plugins sdk
- mcp server

如果没有阅读顺序，很容易掉进某个大文件里看半天，却仍然不知道系统整体如何运作。

本章的目标，就是给你一条“从总览到主链路，再到扩展层”的阅读路径。

## 2. 第一步：先看文档，建立产品心智

在读代码前，先看这些文档：

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `doc/DEVELOPING.md`
5. `doc/DATABASE.md`

这一步的目标不是记细节，而是先回答：

- Paperclip 是什么
- 主要对象有哪些
- V1 的边界在哪里
- 本地怎么跑
- 数据层大致长什么样

## 3. 第二步：看入口，搞清运行骨架

建议读：

- `package.json`
- `server/src/index.ts`
- `server/src/app.ts`
- `ui/src/main.tsx`
- `ui/src/App.tsx`

这一步要搞清楚的不是业务细节，而是：

- 进程怎么启动
- server 和 ui 怎么装配
- 路由主结构是什么
- 控制台主要页面有哪些

## 4. 第三步：读核心业务链

主业务链推荐按这个顺序：

1. `server/src/services/companies.ts`
2. `server/src/services/agents.ts`
3. `server/src/services/issues.ts`
4. `server/src/services/heartbeat.ts`
5. `server/src/services/approvals.ts`
6. `server/src/services/budgets.ts`

这个顺序对应的理解路径是：

- 公司如何存在
- 员工如何存在
- 工作如何存在
- 工作如何被执行
- 人如何治理
- 系统如何控费

## 5. 第四步：把前端和后端对起来

到这一步再回到 UI 会比较顺手。建议这样对照着看：

- `ui/src/pages/Dashboard.tsx` 对 `server/src/routes/dashboard.ts`
- `ui/src/pages/Agents.tsx` / `AgentDetail.tsx` 对 `routes/agents.ts`
- `ui/src/pages/IssueDetail.tsx` 和 `components/IssueDocumentsSection.tsx` 对 `routes/issues.ts` 与 `services/issues.ts`
- `ui/src/pages/Approvals.tsx` 对 `routes/approvals.ts`
- `ui/src/pages/Costs.tsx` 对 `routes/costs.ts` 和 `services/budgets.ts`

这样更容易理解一个页面到底绑定了哪些后端能力。

## 6. 第五步：读数据模型

建议直接看 `packages/db/src/schema/index.ts`，然后跳到这些文件：

- `companies.ts`
- `agents.ts`
- `projects.ts`
- `goals.ts`
- `issues.ts`
- `heartbeat_runs.ts`
- `cost_events.ts`
- `approvals.ts`
- `documents.ts`
- `plugins.ts`

这一步的目标是建立“这些服务到底在操作什么数据”的感觉。

## 7. 第六步：读扩展层

当主链路理解后，再读扩展层：

### Adapter

- `server/src/adapters/`
- `packages/adapters/*`

理解不同 agent runtime 如何接入宿主。

### Plugin

- `server/src/services/plugin-*.ts`
- `packages/plugins/sdk/README.md`
- `doc/plugins/PLUGIN_SPEC.md`

理解 Paperclip 如何成为平台。

### MCP

- `packages/mcp-server/README.md`
- `packages/mcp-server/src/tools.ts`

理解控制平面如何暴露给外部智能体。

## 8. 第七步：读 CLI 和开发支持

如果你要真正参与开发，再看：

- `cli/src/index.ts`
- `cli/src/commands/onboard.ts`
- `cli/src/commands/doctor.ts`
- `cli/src/commands/worktree.ts`
- `scripts/dev-runner.ts`

这会帮助你理解：

- Paperclip 怎样管理自己的开发体验
- 为什么本地运行如此低门槛
- 为什么仓库里有这么多“启动/检查/重启/工作区”逻辑

## 9. 哪些文件最值得优先投入时间

如果时间有限，优先级最高的是：

- `server/src/index.ts`
- `server/src/app.ts`
- `server/src/services/issues.ts`
- `server/src/services/heartbeat.ts`
- `server/src/services/approvals.ts`
- `server/src/services/budgets.ts`
- `ui/src/App.tsx`
- `ui/src/context/CompanyContext.tsx`
- `packages/db/src/schema/index.ts`

这几处足以解释 Paperclip 大部分核心能力。

## 10. 阅读时的三个问题

读任何一个模块时，都可以先问自己：

1. 这个模块是“产品对象”、还是“运行对象”、还是“扩展对象”？
2. 它的 company 边界在哪里？
3. 它和治理逻辑有什么关系？

如果这三个问题答得出来，Paperclip 的代码会比看起来清晰得多。
