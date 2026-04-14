# 扩展开发指南

## 1. 适合哪些扩展作者

这份文档面向三类人：

- 想新增或维护 adapter 的开发者
- 想为 Paperclip 写 plugin 的开发者
- 想把 Paperclip 接到外部 agent / 工具链中的集成开发者

## 2. 先区分三种扩展面

### Adapter

Adapter 解决的是：

> 如何让某种 agent runtime 能被 Paperclip 调用

它更偏“执行接入层”。

### Plugin

Plugin 解决的是：

> 如何扩展 Paperclip 宿主本身的能力和 UI

它更偏“宿主平台扩展层”。

### MCP

MCP 解决的是：

> 如何把 Paperclip 现有控制平面能力暴露给外部智能体

它更偏“集成层”。

如果一开始没分清这三者，很容易选错扩展路径。

## 3. 什么时候该写 Adapter

你应该考虑写 adapter，而不是 plugin，当需求是：

- 接入一种新的 agent runtime
- 接入一个新的本地 CLI agent
- 接入一个 webhook / 远程 agent 调用模型
- 让某种执行器能参与 heartbeat

一个 adapter 通常需要同时考虑三端：

- server 执行
- UI 配置
- CLI / transcript 格式化

也就是说，adapter 通常不是“只写一个 execute 函数”就结束。

## 4. 什么时候该写 Plugin

你应该考虑写 plugin，当需求是：

- 给 Paperclip 增加一个新页面或 widget
- 订阅事件后做同步
- 增加新的工具能力
- 加入定时 job
- 接 webhook 与第三方系统集成

此时你扩展的是宿主，而不是替换 agent runtime。

## 5. Plugin 的最小心智模型

一个 plugin 通常会有这些组成：

- manifest
- worker
- 可选 UI
- 可选 job
- 可选 webhook
- 可选 tools / actions / streams

宿主通过 plugin runtime 去：

- 发现和安装插件
- 启动 worker
- 注册工具
- 同步作业
- 提供 host context 和 host services

如果你写 plugin，建议同时参考：

- `packages/plugins/sdk/README.md`
- `doc/plugins/PLUGIN_SPEC.md`
- `doc/plugins/PLUGIN_AUTHORING_GUIDE.md`

## 6. Plugin UI 开发建议

Plugin UI 当前的实际运行模型是：

- 同源运行在 Paperclip 主应用里
- 通过 bridge 与宿主交互
- 通过 slots、launchers、pages 挂载

这意味着：

- plugin UI 不是完全隔离沙箱
- 需要特别小心能力声明与宿主边界
- 要遵循现有 slot 类型和上下文约定

## 7. 什么时候用 MCP，而不是直接改服务

如果你的目标是让“外部 AI agent 以工具方式访问 Paperclip”，优先考虑 MCP。

MCP server 的特性是：

- 不重写业务逻辑
- 不直连数据库
- 直接包已有 REST API

这样做的好处是：

- server 保持单一业务实现
- 上层 agent 可以用工具方式接入
- 集成边界更稳定

## 8. CLI 扩展的适用场景

如果你的需求是：

- 增强本地安装体验
- 增强运维命令
- 增加 doctor / onboard / configure 类流程
- 支持新的实例管理或工作树管理

那你应该扩展 `cli/`，而不是 plugin 或 adapter。

CLI 偏运维和操作者体验，不偏宿主内嵌功能。

## 9. 开发扩展时的共通检查项

不管你写的是 adapter、plugin 还是 MCP 集成，都建议检查：

- 是否正确尊重 company 边界
- 是否需要成本或活动可见性
- 是否有权限和 actor 语义问题
- 是否与现有 shared 类型保持一致
- 是否已有更接近的扩展路径可复用

Paperclip 最大的风险之一不是“功能不够”，而是“重复做一套平行机制”。

## 10. 从哪里开始读

### Adapter 作者

先读：

- `server/src/adapters/`
- `packages/adapters/*`
- `packages/adapter-utils/`

### Plugin 作者

先读：

- `packages/plugins/sdk/README.md`
- `doc/plugins/PLUGIN_SPEC.md`
- `server/src/services/plugin-*.ts`
- `packages/plugins/examples/`

### MCP / 集成作者

先读：

- `packages/mcp-server/README.md`
- `packages/mcp-server/src/tools.ts`
- `packages/shared/src/api.ts`

## 11. 最后的一条判断标准

你可以用一句话判断自己是否走对扩展路径：

- “我要接入一个执行器” -> Adapter
- “我要增强宿主能力或 UI” -> Plugin
- “我要把现有能力暴露给外部智能体” -> MCP

想清楚这一点，后面的实现方向会清楚很多。
