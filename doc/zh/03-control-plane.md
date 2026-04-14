# 后端与控制平面

## 1. 后端在整个系统中的位置

`server/` 是 Paperclip 的核心。虽然前端很完整，但真正定义产品能力的地方几乎都在后端：

- API 接口
- 认证与权限
- 公司级访问边界
- 任务与评论
- 审批与预算
- heartbeat 执行
- 插件 worker 管理
- 存储与运行时恢复

如果把 Paperclip 看成一个“AI 公司操作系统”，`server/` 就是内核。

## 2. 启动流程

主要入口：

- `server/src/index.ts`
- `server/src/app.ts`

`index.ts` 更偏启动器，负责：

- 读取配置
- 启动嵌入式 Postgres 或连接外部数据库
- 检查并应用迁移
- 初始化本地 board 用户
- 创建 HTTP server
- 处理优雅退出

`app.ts` 更偏装配器，负责：

- 挂载中间件
- 挂载所有 `/api/*` 路由
- 初始化插件系统
- 在 dev 或 static 模式下托管 UI

## 3. 路由层

路由层分成一组资源型 API，大致对应产品主对象：

- `companies`
- `agents`
- `projects`
- `issues`
- `goals`
- `approvals`
- `costs`
- `activity`
- `routines`
- `execution-workspaces`
- `plugins`
- `adapters`
- `instance-settings`
- `health`

从这里可以看出，Paperclip 的后端不是按“技术层”暴露接口，而是按“业务对象”暴露接口。

## 4. 服务层

服务层位于 `server/src/services/`，是后端最值得读的目录。这里基本对应真实业务逻辑，而路由文件更像参数解析和 HTTP 出口。

最核心的服务包括：

### `companies.ts`

负责 company 创建、更新、归档、删除、品牌信息和月度花费聚合。由于 company 是第一等对象，许多功能最终都会落回 company service 的边界上。

### `agents.ts`

负责 agent 生命周期、shortname 去重、汇报链、配置修订版本、API key、状态变化与部分成本统计。

### `issues.ts`

这是当前代码里最重的服务之一。它不只是 issue CRUD，还负责：

- 状态迁移
- assignee / participant / unread / inbox 过滤
- 评论、标签、依赖关系
- 文档、附件、工作产物
- 当前活跃运行状态聚合
- 目标回溯
- 执行工作区继承

从产品上讲，issue 是内建沟通和协作的中心。

### `heartbeat.ts`

这是执行编排核心。它负责：

- 解析 agent 和 issue 上下文
- 合并 project env、secret、workspace 配置
- 调用 adapter
- 管理 run 记录与日志
- 处理 session 型 agent 的延续
- 写回结果摘要和成本信息

### `approvals.ts`

负责审批状态流转。审批通过后并不是简单改个状态，往往会直接推动业务变化，比如激活待审批 agent、自动配预算策略等。

### `budgets.ts`

负责预算策略、月度窗口、阈值、hard stop 和作用域暂停。它体现的是“治理即核心功能”。

## 5. 认证与 actor 模型

后端并不是简单地区分“登录和未登录”，而是维护一个 actor 模型：

- board 用户
- agent
- 本地隐式 board
- session board
- board API key
- agent API key / local JWT

这使得相同接口在不同 actor 下可以有不同权限和语义，也解释了很多 route 在处理请求前都会先解析 `req.actor`。

## 6. 公司边界和治理边界

读后端代码时最重要的两条约束是：

### 公司边界

绝大多数业务对象都必须属于某个 company。后端在很多路由中都会先做 company access 检查。

### 治理边界

变更操作经常会伴随：

- activity log 写入
- board-only 限制
- budget 或 approval 检查

所以在 Paperclip 里，“修改状态”往往意味着一整串治理动作，而不是单表更新。

## 7. 插件系统为何也在后端

插件系统虽然是一种扩展机制，但它的控制中心同样在 server 中。原因很简单：插件 worker、事件总线、工具注册、作业调度、生命周期管理都属于宿主控制平面能力，而不是纯前端能力。

这也是为什么 `app.ts` 中既挂业务路由，也在启动阶段初始化 plugin lifecycle、job scheduler、worker manager。

## 8. 如何读后端代码

推荐顺序：

1. `server/src/index.ts`
2. `server/src/app.ts`
3. `server/src/routes/*.ts`
4. `server/src/services/*.ts`
5. `server/src/middleware/*.ts`
6. `server/src/storage/`、`server/src/secrets/`
7. `server/src/adapters/`、`server/src/realtime/`

如果你的目标是理解“系统如何工作”，优先读 `issues.ts`、`heartbeat.ts`、`approvals.ts`、`budgets.ts` 和 `companies.ts`。
