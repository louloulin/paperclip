# 产品总览

## 1. Paperclip 是什么

Paperclip 的核心定位是：**AI 公司控制平面**。

它不是某个具体模型，也不是某个 agent runtime，而是一层更上层的管理系统，用来统一组织、驱动和约束一群 AI 员工协同工作。这个定位在英文文档 [../GOAL.md](../GOAL.md)、[../PRODUCT.md](../PRODUCT.md)、[../SPEC-implementation.md](../SPEC-implementation.md) 中是高度一致的。

可以把它理解成：

- OpenClaw、Claude Code、Codex、Cursor 这些是“员工”或“执行器”
- Paperclip 是“公司本身”
- 它负责让这些员工知道自己是谁、该做什么、为什么要做、花了多少钱、是否需要审批

## 2. 它解决什么问题

当 AI 只是一两个聊天窗口时，普通对话工具还能凑合用；但当一个人想同时运行十几个甚至几十个 agent，问题会立刻出现：

- 谁在做什么看不清
- 任务之间没有层级与依赖
- 成本可能失控
- agent 运行结果缺乏审计和追踪
- 人类无法在关键节点插手治理
- 多种 agent runtime 难以放进一个统一系统里

Paperclip 的答案不是做一个更强的聊天框，而是把 AI 协作提升到“公司管理”的抽象层。

## 3. 产品最终交付的是什么

从代码实现看，Paperclip 已经交付了一套完整的可运行产品雏形：

- 可以创建多个 company
- 可以给每个 company 建立目标、项目和 issue
- 可以创建 agent 员工并建立汇报关系
- 可以通过 heartbeat 唤醒 agent 执行工作
- 可以查看评论、文档、附件、工作产物和运行日志
- 可以用审批和预算对 agent 行为进行治理
- 可以通过 adapter、plugin、MCP、CLI 扩展系统边界

换句话说，Paperclip 最终交付的不是“AI 功能点”，而是一整套“运行 AI 公司的后台”。

## 4. 产品心智模型

理解整个仓库，最重要的是先理解这些对象：

### Company

Company 是第一等对象。系统不是“一个实例只有一套数据”，而是“一个实例可运行多个 AI 公司”。绝大多数业务数据都应该是 company-scoped。

### Agent

Agent 是员工，而不是抽象线程。每个 agent 都有：

- 身份和角色
- 汇报上级
- adapter 类型
- adapter 配置
- 能力描述
- 成本和预算

### Goal / Project / Issue

Paperclip 用目标层级来保证“为什么做这件事”始终可追溯，用 project 和 issue 表达实际工作拆解。其中 issue 是当前实现里最核心的工作单元。

### Heartbeat

Heartbeat 是 Paperclip 驱动 agent 干活的方式。它会根据任务、上下文、workspace、adapter 配置来唤醒 agent 运行一次，并将结果写回系统。

### Approval / Budget / Activity

这些对象体现的是治理能力：

- Approval 负责关键动作审批
- Budget 负责成本边界
- Activity 负责审计可见性

这决定了 Paperclip 的定位是“安全自治”，而不是“放任 AI 自由运行”。

## 5. 它不是什么

为了正确理解代码边界，也要知道它明确不想成为什么：

- 不是一个通用聊天产品
- 不是一个 pull request review 工具
- 不是一个 prompt 管理器
- 不是一个 drag-and-drop workflow builder
- 不是强绑定某个模型厂商的封闭系统

这也解释了为什么代码中最重的对象不是 chat message，而是 company、agent、issue、heartbeat、approval 和 cost event。

## 6. 当前代码体现出的产品阶段

从仓库规模和模块完整度看，它已经不是 demo：

- 有完整的 server + ui + cli
- 有厚重的 schema 和迁移
- 有 adapter 和 plugin 系统
- 有运行时和工作区管理
- 有 health、doctor、onboard、worktree 等运维能力

这更接近一个 **V1/V1+ 阶段的完整平台产品**，而不是概念验证项目。

## 7. 最重要的结论

如果只记住一句话：

**Paperclip 的产品本质，是把一群 AI agent 从零散工具，提升成一个可管理、可审计、可治理、可扩展的“组织系统”。**
