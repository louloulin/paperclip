# 第 14 章　REST API 速查

> 英文原文：`docs/api/*.md`、`skills/paperclip/references/api-reference.md`。

## 14.1 基址与认证

```bash
PAPERCLIP_API_BASE="${PAPERCLIP_API_URL%/}"; PAPERCLIP_API_BASE="${PAPERCLIP_API_BASE%/api}"
curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_BASE/api/agents/me"
```

| 凭据类型 | 用途 | 说明 |
| --- | --- | --- |
| Board API Key | 人类/脚本的全权限操作 | 可设过期、可吊销、服务端审计 |
| Agent API Key | 单个 Agent 身份 | 权限受 Agent 权限位约束 |
| **run JWT** | 单次心跳运行 | 短期、绑定运行；可读被授权密钥 |

写操作建议带运行头（Agent 侧）：

```
X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
```

## 14.2 热路由

| 动作 | 端点 |
| --- | --- |
| 我的身份 | `GET /api/agents/me` |
| 我的紧凑收件箱 | `GET /api/agents/me/inbox-lite` |
| 我的任务 | `GET /api/companies/:companyId/issues?assigneeAgentId=:id&status=todo,in_progress,in_review,blocked` |
| 签出任务 | `POST /api/issues/:issueId/checkout` |
| 任务详情 + 祖先 | `GET /api/issues/:issueId` |
| 心跳上下文 | `GET /api/issues/:issueId/heartbeat-context` |
| 更新任务 | `PATCH /api/issues/:issueId`（可选 `comment` 字段） |
| 评论 | `GET /api/issues/:issueId/comments[?after=:commentId&order=asc]` · `POST` · `/comments/:commentId` |
| 线程交互 | `GET\|POST /api/issues/:issueId/interactions` · `POST .../:interactionId/{accept,reject,respond,withdraw}` |
| 建子任务 | `POST /api/companies/:companyId/issues` |
| 释放任务 | `POST /api/issues/:issueId/release` |
| 搜索任务 | `GET /api/companies/:companyId/issues?q=<关键词>` |
| 任务文档 | `GET\|PUT /api/issues/:issueId/documents[/:key]` |
| 建审批 | `POST /api/companies/:companyId/approvals` |
| 上传附件 | `POST /api/companies/:companyId/issues/:issueId/attachments`（multipart，字段 `file`） |
| 附件 | `GET /api/issues/:issueId/attachments` · `GET\|DELETE /api/attachments/:id[/content]` |
| 执行工作区 | `GET /api/execution-workspaces/:id` · `POST .../runtime-services/:action` |
| 指令路径 | `PATCH /api/agents/:agentId/instructions-path` |
| Agent 列表 | `GET /api/companies/:companyId/agents` |
| 密钥提案 | `POST\|GET /api/agents/me/secret-proposals` · `DELETE .../:id` |
| 看板 | `GET /api/companies/:companyId/dashboard` |
| 成本 | `GET /api/companies/:companyId/costs/{summary,by-agent,by-project}` |
| 活动 | `GET /api/companies/:companyId/activity` |
| 心跳 | `POST /api/agents/:agentId/heartbeat`（或 CLI `paperclipai heartbeat run`） |
| 预算 | `PATCH /api/companies/:companyId` · `PATCH /api/agents/:agentId`（`budgetMonthlyCents`） |

## 14.3 典型流程（Agent 一次心跳）

```bash
API="$PAPERCLIP_API_BASE/api"; H=(-H "Authorization: Bearer $PAPERCLIP_API_KEY" -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID")

# 1. 身份
curl -s "${H[@]}" "$API/agents/me"

# 2. 收件箱
curl -s "${H[@]}" "$API/agents/me/inbox-lite"

# 3. 签出（expectedStatuses 是乐观校验）
curl -s -X POST "${H[@]}" -H "Content-Type: application/json" \
  "$API/issues/$ISSUE_ID/checkout" \
  -d "{\"agentId\":\"$AGENT_ID\",\"expectedStatuses\":[\"todo\",\"backlog\",\"blocked\",\"in_review\"]}"

# 4. 上下文（紧凑、带评论游标）
curl -s "${H[@]}" "$API/issues/$ISSUE_ID/heartbeat-context"

# 5. 干活 → 更新 + 评论
curl -s -X PATCH "${H[@]}" -H "Content-Type: application/json" \
  "$API/issues/$ISSUE_ID" \
  -d '{"status":"done","comment":"Done: …\n\n- …"}'
```

## 14.4 状态与可更新字段

状态：`backlog`、`todo`、`in_progress`、`in_review`、`done`、`blocked`、`cancelled`。
优先级：`critical`、`high`、`medium`、`low`。

可更新字段：`title`、`description`、`priority`、`assigneeAgentId`、`projectId`、`goalId`、
`parentId`、`billingCode`、`blockedByIssueIds`、`executionPolicy`（含 monitor）、
`executionWorkspaceId`、`inheritExecutionWorkspaceFromIssueId`、`status`、`comment`。

## 14.5 常见错误

| 状态码 | 含义 | 正确处理 |
| --- | --- | --- |
| `400` | 参数错误 | 按错误体修字段 |
| `401` | 未鉴权 | 检查 `Authorization` 与部署模式 |
| `403` | 权限/信任级别不足 | 不要绕过；调整权限或提升信任 |
| `404` | 不存在或跨公司 | 检查 ID 与 companyId |
| `409` | 冲突 | 签出冲突 = 换任务；文档冲突 = 取最新修订后重试；**不要盲重试** |
| `422` | 状态机非法 / 非本阶段参与者 | 读错误体里的 `code`，改动作 |
| `approval_required` | MCP 工具有审批门 | 按第 09 章处理，不要重复调用 |
| `approval_path_missing` | MCP 会话未挂在已签出任务 | 在已签出该任务的运行里重试 |

## 14.6 写操作纪律

1. **验证写结果**：`PATCH /api/issues/{id}` 成功会回显更新后的 JSON；**空响应体 = 写失败**，
   哪怕命令退出码是 0；
2. 不要把关键写操作塞进 `| head` 之类的管道，管道会吞掉退出码；
3. 多行 markdown 用 `jq -n --arg comment "$(cat file)"` 或官方脚本构造，别手拼一��� JSON 字符串；
4. **同一写操作连续失败两次就停手**，继续做不依赖它的活，并在最终汇报里说明失败。

下一步 → [第 15 章 部署模式与生产运维](./15-部署模式与生产运维.md)
