# 运行时与 Heartbeat 机制

## 1. 为什么 Heartbeat 是 Paperclip 的执行核心

Issue 负责表达工作，Agent 负责承担工作，但真正让工作发生的是 heartbeat。

Heartbeat 的作用不是简单“发个命令”，而是把一次 agent 执行变成一个受控、可追踪、可恢复、可计费的运行过程。相关核心代码主要在：

- `server/src/services/heartbeat.ts`
- `server/src/services/heartbeat-run-summary.ts`
- `server/src/services/workspace-runtime.ts`
- `server/src/services/execution-workspaces.ts`

## 2. 一次 heartbeat 发生了什么

概括地说，一次运行会经历这些步骤：

1. 确定触发源
   例如手动、调度器、回调、任务分配等。
2. 读取 agent、issue、project、goal 上下文
3. 合并 adapter config、project env、secret
4. 解析或准备执行工作区
5. 调用 adapter 实际执行
6. 流式记录日志和运行事件
7. 汇总 usage / cost / result
8. 把结果写回到 issue comment、run record、activity 等

这是一条典型的“控制平面包裹执行面”的链路。

## 3. 为什么它不是简单 subprocess

如果只是命令行工具，完全可以直接 `spawn` 一个命令。但 Paperclip 里 heartbeat 之所以复杂，是因为它还要处理：

- agent 会话延续
- 项目级环境变量覆盖
- company secret 解引用
- workspace provision / teardown
- runtime service 生命周期
- 成本归集
- 摘要回写与审计日志
- live updates 推送

因此它更接近“任务执行编排器”而不是简单命令执行器。

## 4. 工作区模型

在实际运行中，代码、仓库、工作目录如何管理是关键问题。Paperclip 当前已经有比较完整的工作区模型：

- project workspace
- execution workspace
- agent home workspace
- git worktree / managed checkout

这些能力共同解决的问题是：

- 让不同 issue 运行在合理的目录上下文中
- 避免 agent 每次都从零开始
- 在需要隔离时提供隔离 workspace
- 为带 repo 的项目自动准备代码工作目录

## 5. Session 型 adapter

仓库中有一类 adapter 会保留 session 概念，例如 Claude/Codex/Cursor 等本地型 adapter。对于这些 adapter，heartbeat 除了“启动一次运行”之外，还要关心：

- 当前 session id
- session 是否应继续复用
- 是否需要 compaction
- 上下文如何压缩到可接受范围

这解释了为什么 heartbeat 代码会依赖 `@paperclipai/adapter-utils` 中的 session compaction 逻辑。

## 6. Run 记录与日志

每一次 heartbeat 都会生成一条或多条运行记录：

- `heartbeat_runs`
- `heartbeat_run_events`

此外还会配合 run log store 存储日志内容。这样做的价值是：

- UI 能显示运行状态
- 系统能恢复或排查失败
- 成本和结果可以关联到具体 run
- 活动流可以展示“谁何时执行了什么”

## 7. 成本与 heartbeat 的关系

Paperclip 并不是先运行完再另外算钱，而是把成本统计当作运行链路的一部分。heartbeat 在解析 adapter 结果时会汇总 usage，并通过 `costService` 写入 `cost_events`。

所以从架构上讲，成本系统不是后处理报表，而是执行路径上的一等数据。

## 8. 与 issue 的关系

Heartbeat 不只是“agent 运行了”，它还要和 issue 工作流对齐：

- 从 issue 拿上下文
- 根据 issue 绑定 assignee、workspace、goal
- 在执行结束后把摘要写回 issue
- 影响 issue 的活动流和可见状态

换句话说，heartbeat 把 issue 从静态工单变成了动态工作对象。

## 9. 故障恢复与调度

系统不是只会“跑一次”，还考虑了：

- queued run 恢复
- orphaned run 回收
- timer tick
- scheduler 触发
- runtime service 重连

这些逻辑散落在 `heartbeat.ts`、`workspace-runtime.ts` 以及 server 启动流程中，说明它已经在朝“持续运行的自治系统”方向演进。

## 10. 结论

理解 Paperclip 是否真正成立，关键就在 heartbeat：如果没有 heartbeat，它只是任务管理系统；有了 heartbeat，它才真正成为 AI 公司控制平面。
