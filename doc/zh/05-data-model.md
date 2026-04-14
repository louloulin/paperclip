# 数据模型

## 1. 数据模型的角色

Paperclip 的数据库模型不只是“存页面表单”，它实际上在表达一家公司如何运转。也因此，`packages/db/src/schema/` 的结构本身就是 Paperclip 产品模型的实体化版本。

从 `packages/db/src/schema/index.ts` 可以看出，当前 schema 已经覆盖：

- 公司与成员
- agent 身份与运行态
- goal / project / issue 工作模型
- 文档、附件、工作产物
- heartbeat run 与运行日志
- cost、budget、finance
- approval 与评论
- plugin、job、state、webhook
- execution workspace 与 runtime service

这说明代码里的“平台感”很大程度上来自数据模型，而不是只来自业务代码。

## 2. 五组核心数据

### 公司与权限

核心表：

- `companies`
- `company_memberships`
- `instance_user_roles`
- `invites`
- `join_requests`

这一组解决的是：

- 一台 Paperclip 实例怎样承载多个 company
- 谁是 board / admin
- 谁对哪个公司有访问权

### 组织与 agent

核心表：

- `agents`
- `agent_api_keys`
- `agent_config_revisions`
- `agent_runtime_state`
- `agent_task_sessions`
- `agent_wakeup_requests`

这一组体现出：agent 不是临时请求，而是长期存在的“员工对象 + 运行身份 + 会话状态”。

### 工作对象

核心表：

- `goals`
- `projects`
- `issues`
- `issue_comments`
- `issue_relations`
- `labels`
- `issue_labels`
- `issue_read_states`
- `issue_inbox_archives`

其中 `issues` 是最重要的工作单元，既承担任务，也承载协作和上下文。

### 执行与产出

核心表：

- `heartbeat_runs`
- `heartbeat_run_events`
- `documents`
- `document_revisions`
- `issue_documents`
- `assets`
- `issue_attachments`
- `issue_work_products`

这一组表体现出 Paperclip 的一个关键设计：**工作不只是一条状态，而是一套可见的产物和过程记录。**

### 治理与扩展

核心表：

- `cost_events`
- `budget_policies`
- `budget_incidents`
- `approvals`
- `approval_comments`
- `activity_log`
- `plugins`
- `plugin_jobs`
- `plugin_state`
- `plugin_logs`

它们共同定义了“平台是否可控”和“平台是否可扩展”。

## 3. Company 是第一层外键边界

在阅读 schema 时，最需要关注的是 company 维度。对于 Paperclip 来说，company 不只是一个标签，而是：

- 数据隔离边界
- 审计边界
- 成本归属边界
- 权限边界
- 执行边界

因此几乎所有业务主表都带 `company_id`。

## 4. 为什么 `issues` 这么重要

文档里会提 goal 和 project，但从代码密度看，`issues` 仍然是系统最重要的工作实体，因为它连接了：

- assignee
- goal / project
- comment thread
- 依赖关系
- 文档和附件
- 工作产物
- 当前活跃运行
- 阅读状态和 inbox

可以说，Paperclip 的“内建沟通系统”基本就是 issue-backed communication。

## 5. 文档与版本化

一个很有代表性的设计是文档系统：

- `documents`
- `document_revisions`
- `issue_documents`

它表明 Paperclip 不把任务说明只塞进 issue description，而是把 plan、spec、其他文档做成可修订对象。这种设计更接近工作系统而不是聊天系统。

## 6. 运行态和持久态是分开的

Paperclip 并没有把所有运行信息直接塞回 agent 或 issue 主表，而是用专门的运行态表来处理：

- `heartbeat_runs` 表示一次执行
- `agent_task_sessions` 表示某种长期上下文
- `agent_runtime_state` 表示代理运行时状态
- `workspace_runtime_services` 表示工作区里的后台服务

这种分层让系统能同时保留：

- 长期业务对象
- 短期执行过程
- 恢复和重放需要的状态

## 7. Plugin 数据模型说明了什么

从 plugin 相关表可以看出，插件并不是“前端小挂件”，而是系统级扩展对象：

- 有插件自身元数据
- 有配置
- 有实体镜像
- 有状态存储
- 有作业和日志
- 有 webhook 交付记录

这进一步证明了仓库已经具备平台属性。

## 8. 如何读 schema

建议按以下顺序读：

1. `companies.ts`
2. `agents.ts`
3. `goals.ts`
4. `projects.ts`
5. `issues.ts`
6. `issue_comments.ts` / `issue_relations.ts`
7. `heartbeat_runs.ts`
8. `cost_events.ts` / `budget_policies.ts`
9. `approvals.ts`
10. `plugins*.ts` / `execution_workspaces.ts`

如果你先读 `schema/index.ts` 再按上面的顺序深入，会更容易把产品模型和表结构对起来。
