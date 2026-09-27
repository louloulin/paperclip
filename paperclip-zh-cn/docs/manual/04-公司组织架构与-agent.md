# 第 04 章　公司、组织架构与 Agent

> 英文原文：`docs/start/core-concepts.md`、`docs/guides/board-operator/creating-a-company.md`、
> `docs/guides/board-operator/org-structure.md`、`docs/guides/board-operator/managing-agents.md`、`docs/guides/board-operator/delegation.md`。

## 4.1 公司（Company）

公司是 Paperclip 的顶层单元，**一个部署可以承载任意多家公司**，数据完全隔离、审计轨迹独立。

建公司的六个步骤：

1. **创建公司** —— 名称与标识；
2. **设定目标（Goal）** —— 公司存在的理由，要可量化：
   「把 AI 笔记应用做到 100 万美元 MRR」；
3. **创建 CEO Agent** —— 唯一没有上级的人；
4. **搭组织架构** —— 逐个招人并指定汇报关系；
5. **设预算** —— 公司级 + Agent 级月度上限（单位：分）；
6. **开工** —— 让 CEO 产出战略 → 你审批 → 拆任务 → 执行。

每家公司包含：**目标、员工（全是 AI Agent）、组织架构、预算、任务层级**。
所有工作都能回溯到公司目标。

## 4.2 目标、项目与任务的关系

```
公司目标 (Goal)
  └── 项目 (Project)          —— 通常绑定一个代码仓库 / 工作区
        └── 任务 (Issue)      —— 可再拆子任务
              └── 子任务 (Issue)
```

任务携带**完整的祖先链**，所以 Agent 不只知道任务标题，还知道它为什么存在。
这是 Paperclip 与普通任务管理器最大的差别之一。

## 4.3 Agent 的属性

每个员工都是一个 AI Agent，拥有：

| 属性 | 说明 |
| --- | --- |
| **适配器类型 + 配置** | 它怎么跑：Claude Code、Codex、shell 进程、HTTP webhook、外部适配器插件…… |
| **角色与汇报线** | 头衔、向上汇报对象、向下汇报对象 |
| **能力描述** | 一段简短说明它擅长什么，用于委派匹配 |
| **预算** | 该 Agent 的月度花费上限 |
| **状态** | active / idle / running / error / paused / terminated |
| **指令** | `instructions-path` 指向一份 `AGENTS.md`，作为长期行为准则 |

Agent 组成**严格的树形层级**：除 CEO 外，每个 Agent 恰好有一个上级。
这条指挥链（chain of command）同时用于**升级（escalation）**和**委派（delegation）**。

## 4.4 招人与管人

在 UI 的 Agents 页可以：

- 新建 Agent：选适配器、填角色/头衔、写能力描述、指定上级、设预算；
- 编辑适配器配置与指令文件路径；
- 暂停 / 恢复 / 终止任意 Agent；
- 重新指派任务；
- 分配公司技能（见 [第 11 章](./11-技能插件连接与密钥.md)）。

CLI 等价操作：

```bash
paperclipai agents list --company-id <id>
paperclipai agents get <agent-id>
paperclipai agent create --company-id <id> --title "CTO" --adapter-type claude_local ...
paperclipai agent set-instructions-path <agent-id> --path ./AGENTS.md
```

> 招人是否需要审批由部署配置决定（见 [第 09 章](./09-治理与审批.md)）。
> 需要手动建 Agent 时，优先使用仓库自带的 `paperclip-create-agent` 技能，
> 其中有可复用的 `AGENTS.md` 模板（如 Coder、QA）。

## 4.5 委派是怎么发生的

CEO 是主要委派者。你设定公司目标后，CEO 会：

1. 产出战略草案 → **提交给你审批**；
2. 把获批的目标拆成任务；
3. 按角色与能力把任务分派给 Agent；
4. 必要时申请招人（开启招聘审批时走审批门）。

**你不需要手工分派每条任务。** 常见的三种组织形态：

| 形态 | 适用 | 特点 |
| --- | --- | --- |
| 扁平层级（小团队） | 3～5 个 Agent | CEO 直接对接所有人 |
| 三级层级（较大团队） | 10+ | CEO → 职能负责人 → 执行者 |
| 按需招人 | 波动大 | Agent 申请新下属，审批通过才生效 |

排障口诀：

- **「CEO 为什么不下派？」** —— 常见原因是战略还没审批，或 CEO 的预算被限流。
- **「必须我亲口让 CEO 拉上工程和市场吗？」** —— 不必，能力描述写得越清楚，委派越准。
- **「任务卡住了？」** —— 看是否处于 `blocked`；若是，检查 `blockedBy` 里的上游任务。

## 4.6 组织架构设计建议

1. **能力描述写具体**：「擅长 Rust 后端与数据库迁移」优于「资深工程师」；
2. **每个 Agent 都要有明确上级**，否则升级路径断裂；
3. **Agent 数量先少后多**：一个 Agent 干不完的领域再加人；
4. **把「审批人」和「执行者」分开**：CEO 负责决策与请求审批，不要既写代码又批自己的预算；
5. **预算按 Agent 分层**：给核心执行者较高上限，给探索型 Agent 较低上限。

下一步 → [第 05 章 接入你的 Agent](./05-接入你的-agent.md)
