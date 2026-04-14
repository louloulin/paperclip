# Paperclip 中文说明文档

本目录是一套面向中文读者的 Paperclip 代码与产品说明文档，目标不是逐行翻译英文文档，而是从“产品是什么、系统怎么组成、代码该从哪里读”三个角度，给出一套更适合开发者和使用者快速建立整体认知的中文版本。

## 推荐阅读顺序

1. [01-overview.md](./01-overview.md)
   先理解 Paperclip 到底是什么、解决什么问题、核心对象有哪些。
2. [02-architecture.md](./02-architecture.md)
   再看整体架构，明确 `server / ui / cli / packages/*` 分工。
3. [03-control-plane.md](./03-control-plane.md)
   聚焦后端控制平面：API、服务层、治理逻辑。
4. [04-ui.md](./04-ui.md)
   看前端控制台如何组织页面、状态和交互。
5. [05-data-model.md](./05-data-model.md)
   看数据库如何表达“AI 公司”的组织、任务、运行和扩展。
6. [06-runtime-heartbeat.md](./06-runtime-heartbeat.md)
   理解任务如何真正被 agent 执行。
7. [07-adapters-plugins-mcp.md](./07-adapters-plugins-mcp.md)
   理解扩展机制：adapter、plugin、MCP。
8. [08-cli-dev-deploy.md](./08-cli-dev-deploy.md)
   理解 CLI、开发、部署、本地运行模式。
9. [09-reading-guide.md](./09-reading-guide.md)
   如果你要继续深入读代码，从这里拿到一条建议路径。
10. [10-backend-dev-guide.md](./10-backend-dev-guide.md)
   面向后端开发者的增量开发说明。
11. [11-frontend-dev-guide.md](./11-frontend-dev-guide.md)
   面向前端开发者的页面、组件、状态和 API 协作说明。
12. [12-extension-dev-guide.md](./12-extension-dev-guide.md)
   面向 adapter、plugin、MCP 扩展作者的开发入口。

## 文档覆盖范围

这套文档基于当前仓库实际代码组织撰写，重点覆盖：

- 产品定位和目标
- Monorepo 结构与包边界
- Server、UI、CLI、DB、Shared 等核心模块
- Issue、Heartbeat、Approval、Budget 等主流程
- Adapter、Plugin、MCP Server 等扩展面
- 本地开发、嵌入式 PostgreSQL、运行模式和代码阅读建议

## 与英文文档的关系

英文文档仍然是仓库的正式原始资料，尤其这些文件最关键：

- [../GOAL.md](../GOAL.md)
- [../PRODUCT.md](../PRODUCT.md)
- [../SPEC-implementation.md](../SPEC-implementation.md)
- [../DEVELOPING.md](../DEVELOPING.md)
- [../DATABASE.md](../DATABASE.md)

本目录的职责更偏向：

- 给中文读者建立“全局心智模型”
- 解释英文文档与实际代码之间的映射
- 帮助新开发者快速进入代码

## 适合谁看

- 想理解 Paperclip 产品定位的产品经理
- 想快速接手仓库的开发者
- 想把 Paperclip 当作“AI 公司控制台”来使用的操作者
- 想开发 adapter、plugin、CLI 集成或 MCP 工具的扩展作者

## 一句话总结

Paperclip 不是单个 AI agent，也不是聊天机器人。它是一套“AI 公司控制平面”：把公司、组织、任务、执行、预算、审批、日志和扩展能力统一到一个系统里。
