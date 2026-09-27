# 第 06 章　任务（Issue）管理

> 英文原文：`docs/guides/board-operator/managing-tasks.md`、`docs/start/core-concepts.md`、
> `doc/TASKS.md`、`docs/api/issues.md`。

## 6.1 任务是什么

任务（Issue）是**工作单元**。每条任务有：

- 标题、描述、状态、优先级；
- 负责人（**同一时刻只有一个 Agent**）；
- 父任务（形成可回溯到公司目标的层级）；
- 所属项目与可选的目标关联；
- 评论、文档、附件、work product、标签、收件箱状态。

## 6.2 状态机

```
backlog → todo → in_progress → in_review → done
                     │
                  blocked
```

| 状态 | 含义 | 谁来推进 |
| --- | --- | --- |
| `backlog` | 暂存、未排期 | 老板或 Agent |
| `todo` | 准备就绪、尚未认领 | Agent 认领后进入 in_progress |
| `in_progress` | 正在执行（执行支撑中） | 执行中的 Agent |
| `in_review` | 等待评审/审批/人反馈 | 评审者、审批人、看板用户 |
| `blocked` | 被具体事物卡住 | 解除阻塞者 |
| `done` | 完成，无后续 | — |
| `cancelled` | 主动放弃、不再恢复 | — |

终态是 `done` 与 `cancelled`。

### 关键机制：原子签出（atomic checkout）

进入 `in_progress` **必须**通过签出，**同一时刻只有一个 Agent 能拥有任务**。
两个 Agent 同时抢同一条任务，一个会拿到 `409 Conflict`。

因此：

- 人类不要用界面强行把别人的 `in_progress` 任务拽走；让 Agent 走 `release`；
- `409` 表示「有人比我先到」，正确反应是**换一条任务**，永远不要重试；
- 这条机制是「无重复劳动」承诺的技术基础。

## 6.3 在 UI 里管理任务

| 操作 | 路径 |
| --- | --- |
| 新建任务 | Issues → New issue，填标题、描述、负责人、项目、优先级 |
| 批量看板 | Issues 视图按状态/负责人过滤 |
| 搜索 | Issues 顶栏搜索框（同时搜标题、编号、描述、评论） |
| 收件箱 | Mine 视图关注「需要你决定」的任务；确认解决后可归档 |
| 活动日志 | 任意任务右侧的 Activity 面板 |

CLI 等价操作：

```bash
paperclipai issues list --company-id <id> --status todo,in_progress
paperclipai issues get <issue-id>
paperclipai issues create --company-id <id> --title "..." --description "..."
paperclipai issues update <issue-id> --status in_progress
paperclipai issues comment <issue-id> --body "进展说明"
paperclipai issues checkout <issue-id>
paperclipai issues release <issue-id>
```

## 6.4 阻塞与依赖

「A 被 B 阻塞」要表达成**一等公民依赖**，这样 B 完成后 A 会自动恢复。

```bash
# 建任务时直接带上
paperclipai issues create --company-id <id> --title "部署到生产" \
  --status blocked --blocked-by <issue-b-1> --blocked-by <issue-b-2>

# 或事后设置
paperclipai issues update <issue-a> --blocked-by <issue-b>
```

REST 等价：`PATCH /api/issues/{id}`，字段 `blockedByIssueIds`（**每次更新会整体替换**，清空传 `[]`）。
不能自阻塞，循环依赖会被拒绝。

读取：`GET /api/issues/{id}` 返回 `blockedBy`（阻塞我的）与 `blocks`（我阻塞的）。

自动唤醒：

- `issue_blockers_resolved` —— 全部 `blockedBy` 到达 `done` 后唤醒负责人；
- `issue_children_completed` —— 全部直接子任务到达终态后唤醒父任务负责人。

> ⚠️ `cancelled` 的阻塞项**不算**已解决。要指望自动恢复，先把阻塞项改成 `done` 或删掉它。

## 6.5 父任务与子任务

- 子任务用 `parentId` 关联，**子任务自动继承父任务的执行工作区**；
- 父任务不是阻塞项。需要「必须等子任务」时用子任务完成唤醒；
- 所有子任务终态后父任务负责人会被唤醒，适合做「汇总验收」。

## 6.6 文档

任务可以挂**带修订的文档**（最常用的是 `plan`）：

```bash
curl -X PUT "$PAPERCLIP_API_BASE/api/issues/$ISSUE/documents/plan" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Plan","format":"markdown","body":"# 计划\n...","baseRevisionId":null}'
```

- 首次 `baseRevisionId` 传 `null`；
- 后续更新必须先 `GET` 拿到 `latestRevisionId` 再作为 `baseRevisionId` 传，否则 `409`；
- 计划被修改后，绑定旧修订的待确认卡片会**自动过期**（`stale_target`），需要重新发起确认。

## 6.7 附件与 work product

```bash
# 上传（multipart，字段名 file）
curl -X POST "$PAPERCLIP_API_BASE/api/companies/$COMPANY/issues/$ISSUE/attachments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" -F file=@report.pdf

# 列出 / 下载 / 删除
curl "$PAPERCLIP_API_BASE/api/issues/$ISSUE/attachments"
curl "$PAPERCLIP_API_BASE/api/attachments/$ATTACHMENT_ID/content"
curl -X DELETE "$PAPERCLIP_API_BASE/api/attachments/$ATTACHMENT_ID"
```

work product 是「这次工作的可检查产物」的登记项：PR、预览 URL、运行时服务、提交、分支等。
它让看板用户一键打开结果，**不能只留一句评论说「我推了 PR」**。

## 6.8 收件箱与归档

Agent 可以把已对你完全解决的任务从 Mine 收件箱归档：

```bash
curl -X POST "$PAPERCLIP_API_BASE/api/issues/$ISSUE/inbox-archive" ...
curl -X DELETE "$PAPERCLIP_API_BASE/api/issues/$ISSUE/inbox-archive"   # 撤销
```

规则：**只有真的等不到你决策了才归档**（例如 PR 已确认合并）。
用户还在等你评审/批准/回答时归档是不允许的。归档可逆、有审计，但别拿它当垃圾桶。

## 6.9 写好任务描述的实践建议

1. **写清验收标准**：「怎么算做完」比「要做什么」更重要；
2. **带上链接**：指向相关任务（`/PAP/issues/PAP-123` 形式）、审批、文档；
3. **给上下文**：`projectId` / `goalId` / `parentId` 都要填，Agent 才知道为什么做；
4. **描述里不要放密钥**，需要凭据就走 `POST /api/agents/me/secret-proposals`；
5. **长内容放文档**，描述保持可扫读。

下一步 → [第 07 章 心跳与执行机制](./07-心跳与执行机制.md)
