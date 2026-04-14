# 适配器、插件与 MCP

## 1. 为什么扩展层很重要

Paperclip 不是强绑定某个模型或某个 agent 产品的系统。它的价值之一，就是把“外部执行器”与“内部控制平面”解耦。因此仓库里有三类扩展面：

- Adapter
- Plugin
- MCP Server

三者分别解决不同层次的问题。

## 2. Adapter：接入 agent runtime

Adapter 的作用是把不同外部 agent 运行方式统一成 Paperclip 可调用的形式。当前仓库已经包含多个 adapter 包，例如：

- `claude-local`
- `codex-local`
- `cursor-local`
- `gemini-local`
- `opencode-local`
- `pi-local`
- `openclaw-gateway`

它们通常包含三部分：

- server 端执行逻辑
- UI 端配置展示逻辑
- CLI / stdout 解析逻辑

这意味着 adapter 不只是后端抽象，也会影响前端配置界面和运行展示。

## 3. Adapter 在产品中的意义

Paperclip 的产品哲学是：

> If it can receive a heartbeat, it's hired.

也就是说，Paperclip 不规定 agent 必须怎么实现，只要求它能被纳入调度、可被唤醒、可回传结果、可被计费和治理。

这就是 adapter 存在的意义：统一接入，而不是统一实现。

## 4. Fork 中的 Hermes 背景

根据仓库根目录的 AGENTS 说明，这个 fork 还特别强调 Hermes adapter 的“外置化”方向：

- Hermes 不应再作为内建硬编码 adapter
- 应通过 Adapter Plugin Manager 以插件形式安装
- UI 侧也应尽量依赖通用 schema / parser，而不是硬编码导入

这说明 adapter 系统正在从“内建若干 provider”进一步演进到“可插拔 provider 平台”。

## 5. Plugin：扩展宿主能力

Plugin 与 adapter 不同。Adapter 解决“怎么运行 agent”，Plugin 解决“怎么扩展 Paperclip 自身”。

从代码和 `packages/plugins/sdk/README.md` 看，Plugin 可以扩展：

- worker 生命周期
- 事件订阅和事件发出
- 调度作业
- host state
- tool 注册
- webhook
- UI slot、page、widget、launcher

因此 plugin 的定位更接近“宿主应用扩展包”，而不是简单脚本。

## 6. Plugin Runtime 的宿主实现

Plugin Runtime 的中心在 `server/src/services/plugin-*.ts` 这一组文件：

- `plugin-loader`
- `plugin-worker-manager`
- `plugin-lifecycle`
- `plugin-job-scheduler`
- `plugin-job-coordinator`
- `plugin-tool-dispatcher`
- `plugin-registry`
- `plugin-event-bus`

这些名字本身就说明：插件系统已经不是“加载一个 manifest 文件”，而是一个完整运行时。

## 7. Plugin SDK 提供了什么

`@paperclipai/plugin-sdk` 面向插件作者，提供：

- `definePlugin`
- worker setup context
- UI hooks
- test harness
- bundler presets
- dev server

从 README 可以看出，它支持的插件能力已经覆盖 worker、UI、工具、作业和测试，这意味着插件体系已经具备“开发者生态”的雏形。

## 8. MCP Server：把 REST 能力包装成工具面

`packages/mcp-server` 是另一条很重要的扩展线。它不是直接访问数据库，而是一个 **REST API 的 MCP 包装层**。

它的价值在于：

- 让外部 AI agent 通过 MCP 访问 Paperclip
- 避免为每种上层 agent 再写一套集成逻辑
- 保持业务逻辑仍然只在 server 中实现一次

从 README 看，它已经暴露了：

- agent / inbox / issue / project / goal / approval 的读取工具
- issue 更新、comment、checkout、document、approval 决策等写工具
- 一个受限的 `paperclipApiRequest` 逃生口

## 9. CLI 与 MCP 的差别

虽然 CLI 和 MCP 都属于“外部接入面”，但职责不同：

- CLI 更面向操作者和本地开发者
- MCP 更面向外部 AI agent / MCP client

CLI 会处理：

- onboard
- doctor
- run
- worktree
- routines
- 配置和环境

MCP 则处理：

- 把控制平面对象暴露成工具接口

## 10. 结论

如果只看主应用，Paperclip 已经是完整产品；如果把 adapter、plugin、MCP 一起看，它更像一个可扩展平台。

三者的定位可以记成：

- Adapter：接入外部 agent runtime
- Plugin：扩展宿主能力与 UI
- MCP：把控制平面能力开放给外部智能体
