# 第 13 章　CLI 完全参考

> 英文原文：`doc/CLI.md`（工程文档，最全）、`docs/cli/*.md`（产品文档）。
> 运行方式二选一：源码仓库用 `pnpm paperclipai <cmd>`，npm 用 `npx paperclipai <cmd>`。
> 本章命令以 `npx paperclipai` 书写。

## 13.1 全局参数

所有命令都支持：

| 参数 | 说明 |
| --- | --- |
| `--data-dir <path>` | 本地数据根目录（与 `~/.paperclip` 隔离） |
| `--api-base <url>` | API 基址 |
| `--api-key <token>` | API 认证 token |
| `--context <path>` | 上下文文件路径 |
| `--profile <name>` | 上下文 profile 名 |
| `--json` | 以 JSON 输出 |

公司维度命令额外支持 `--company-id <id>`。

要一个干净的本地实例，就在每条命令上带 `--data-dir`：

```bash
npx paperclipai run --data-dir ./tmp/paperclip-dev
npx paperclipai issue list --data-dir ./tmp/paperclip-dev
```

> **安全提示**：带内容参数（描述、评论、payload）时，优先用 `--body-file` / `--payload-json` / heredoc，
> 避免 shell 转义把内容改坏。

## 13.2 上下文 profile

```bash
npx paperclipai context set --api-base http://localhost:3100 --company-id <company-id>
npx paperclipai context set --persona agent --agent-id <agent-id> \
  --api-key-env-var-name PAPERCLIP_API_KEY
npx paperclipai context show
npx paperclipai context list
npx paperclipai context use default
```

上下文文件：`~/.paperclip/context.json`。

## 13.3 安装、升级、卸载

```bash
npx paperclipai install [--canary]
npx paperclipai update
npx paperclipai uninstall
npx paperclipai doctor
npx paperclipai configure
npx paperclipai allowed-hostname <hostname>     # 允许自定义 Tailscale 主机名
```

## 13.4 引导、服务与环境

```bash
npx paperclipai onboard [--yes] [--bind loopback|lan|tailnet|custom]
npx paperclipai test-drive [--harness codex|opencode] [--model <p/m>] [--no-browser] [--data-dir <path>]
npx paperclipai run [--instance <name>]
npx paperclipai service install|start|stop|status
npx paperclipai env            # 查看运行环境
npx paperclipai env-lab up|doctor|status|down
npx paperclipai connect         # 连接向导
npx paperclipai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```

## 13.5 公司

```bash
npx paperclipai company list
npx paperclipai company current [--company-id <id>]
npx paperclipai company get <company-id>
npx paperclipai company stats
npx paperclipai company create --payload-json '{...}'
npx paperclipai company update <company-id> --payload-json '{...}'
npx paperclipai company branding:update <company-id> --payload-json '{...}'
npx paperclipai company archive <company-id>

# 导出 / 导入（可移植公司包：manifest + markdown）
npx paperclipai company export <company-id> --out ./company \
  --include company,agents,projects,issues,skills
npx paperclipai company import ./company --target new --new-company-name "Imported Company"
npx paperclipai company import:preview <company-id> --payload-json '{...}'
npx paperclipai company import:apply  <company-id> --payload-json '{...}'

npx paperclipai company delete PAP --yes --confirm PAP
```

- `company create` 需要看板/实例管理员鉴权；
- 用 Agent 鉴权时，`company list` 先试全量列表，被拒则回退到 `--company-id` /
  `PAPERCLIP_COMPANY_ID` / 上下文 / `/api/agents/me`；
- 云托管实例上 `company import` 不可用（服务端 `403` `cloud_managed`），导出仍可用。

## 13.6 任务（Issue）

```bash
npx paperclipai issue list --company-id <id> [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]
npx paperclipai issue get <issue-id-or-identifier>
npx paperclipai issue create --company-id <id> --title "..." [--description "..."] [--status todo] [--priority high]
npx paperclipai issue update <issue-id> [--status in_progress] [--comment "..."]
npx paperclipai issue delete <issue-id> --yes

npx paperclipai issue comment <issue-id> --body "..." [--attachment-id <id...>] [--reopen]
npx paperclipai issue comments <issue-id> [--limit 50]
npx paperclipai issue comment:get <issue-id> <comment-id>
npx paperclipai issue comment:delete <issue-id> <comment-id>

npx paperclipai issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
npx paperclipai issue release <issue-id>
npx paperclipai issue force-release <issue-id>
npx paperclipai issue child:create <issue-id> --payload-json '{"title":"Child task"}'

npx paperclipai issue runs|live-runs|active-run <issue-id>
npx paperclipai issue heartbeat-context <issue-id>
npx paperclipai issue approvals <issue-id>
npx paperclipai issue approval:link|approval:unlink <issue-id> <approval-id>
npx paperclipai issue recovery-actions <issue-id>
npx paperclipai issue recovery:resolve <issue-id> --outcome restored --source-issue-status todo
npx paperclipai issue read|unread|archive|unarchive <issue-id>
```

### 文档、work product、交互卡片、附件

```bash
npx paperclipai issue documents <issue-id> [--include-system]
npx paperclipai issue document:get <issue-id> <key>
npx paperclipai issue document:put  <issue-id> <key> --body-file ./plan.md [--title Plan]
npx paperclipai issue document:revisions <issue-id> <key>
npx paperclipai issue document:restore <issue-id> <key> <revision-id>
npx paperclipai issue document:lock|unlock|delete <issue-id> <key>

npx paperclipai issue work-products <issue-id>
npx paperclipai issue work-product:create <issue-id> \
  --payload-json '{"type":"pull_request","provider":"github","title":"PR"}'
npx paperclipai issue work-product:update <work-product-id> --payload-json '{"status":"archived"}'
npx paperclipai issue work-product:delete <work-product-id>

npx paperclipai issue interactions <issue-id>
npx paperclipai issue interaction:create <issue-id> \
  --payload-json '{"kind":"request_confirmation","payload":{"version":1,"prompt":"Continue?"}}'
npx paperclipai issue interaction:accept <issue-id> <interaction-id> [--selected-client-keys k1,k2]
npx paperclipai issue interaction:reject  <issue-id> <interaction-id> [--reason "..."]
npx paperclipai issue interaction:respond <issue-id> <interaction-id> --answers-json '[...]'
npx paperclipai issue interaction:cancel <issue-id> <interaction-id> [--reason "..."]

npx paperclipai issue attachment:upload <issue-id> --company-id <id> --file ./artifact.txt
npx paperclipai issue attachment:download <attachment-id> [--out ./artifact.txt]
npx paperclipai issue attachment:delete <attachment-id>
npx paperclipai issue label:list|create|delete ...
```

### 任务树暂停（tree hold）

```bash
npx paperclipai issue tree-state <issue-id>
npx paperclipai issue tree-preview <issue-id> --payload-json '{"mode":"pause"}'
npx paperclipai issue tree-holds <issue-id> [--status active] [--include-members]
npx paperclipai issue tree-hold:create <issue-id> --payload-json '{"mode":"pause","reason":"review"}'
npx paperclipai issue tree-hold:release <issue-id> <hold-id> --payload-json '{"reason":"done"}'
```

## 13.7 项目与目标

```bash
npx paperclipai project list --company-id <id>
npx paperclipai project create --company-id <id> --name "Launch Site" [--goal-ids <ids>] [--lead-agent-id <id>]
npx paperclipai project update <project-id> --execution-workspace-policy-json '{"enabled":true,"defaultMode":"shared_workspace"}'
npx paperclipai project create --company-id <id> --name "Ops" \
  --env-json '{"OPENAI_API_KEY":{"kind":"secret","secretName":"openai-api-key"}}'

npx paperclipai goal list --company-id <id>
npx paperclipai goal create --company-id <id> --title "Grow revenue" [--level company] [--status active]
npx paperclipai goal update <goal-id> [--title "..."] [--status achieved]
```

## 13.8 Agent

```bash
npx paperclipai agent list --company-id <id>
npx paperclipai agent get <agent-id>
npx paperclipai agent me
npx paperclipai agent inbox
npx paperclipai agent inbox-mine --user-id <board-user-id>
npx paperclipai agent create --company-id <id> --payload-json '{"name":"Builder","adapterType":"codex_local"}'
npx paperclipai agent hire   --company-id <id> --payload-json '{...}'
npx paperclipai agent update <agent-id> --payload-json '{"title":"Senior Builder"}'
npx paperclipai agent delete <agent-id> --yes

npx paperclipai agent wake <agent-id-or-shortname> [--reason "..."] [--payload '{"issueId":"..."}']
npx paperclipai agent pause|resume|approve|terminate <agent-id>
npx paperclipai agent heartbeat:invoke <agent-id>
npx paperclipai agent claude-login <agent-id>
npx paperclipai agent local-cli <agent-id-or-shortname> --company-id <id>

npx paperclipai agent permissions:update <agent-id> \
  --payload-json '{"canCreateAgents":true,"canCreateSkills":true,"canAssignTasks":true}'

npx paperclipai agent configuration <agent-id>
npx paperclipai agent config-revisions <agent-id>
npx paperclipai agent config-revision:rollback <agent-id> <revision-id>

npx paperclipai agent runtime-state <agent-id>
npx paperclipai agent runtime-state:reset-session <agent-id> [--task-key <key>]
npx paperclipai agent task-sessions <agent-id>

npx paperclipai agent skills <agent-id>
npx paperclipai agent skills:sync <agent-id> --desired-skills paperclip,github --mode add
npx paperclipai agent instructions-path:update <agent-id> --payload-json '{"path":"/path/to/AGENTS.md"}'
npx paperclipai agent instructions-bundle:update <agent-id> --payload-json '{"mode":"managed"}'
npx paperclipai agent instructions-file:put <agent-id> --path AGENTS.md --content-file ./AGENTS.md
```

## 13.9 令牌

```bash
# Agent key（长期）
npx paperclipai token agent create --company-id <id> --agent <agent> --name external-worker
npx paperclipai token agent list   --company-id <id> --agent <agent>
npx paperclipai token agent revoke --company-id <id> --agent <agent> <key-id>

# Board key（人类鉴权，支持吊销、过期元数据、服务端审计）
npx paperclipai token board create --company-id <id> --name external-admin
npx paperclipai token board create --name short-lived --ttl-days 7
npx paperclipai token board list
npx paperclipai token board revoke <key-id>
```

## 13.10 运行（run）排查

```bash
npx paperclipai run list --company-id <id> [--agent-id <id>] [--limit 50]
npx paperclipai run live --company-id <id> [--limit 50] [--min-count 0]
npx paperclipai run get <run-id>
npx paperclipai run events <run-id> [--after-seq 0] [--limit 200]
npx paperclipai run log <run-id> [--offset 0] [--limit-bytes 16384] [--text]
npx paperclipai run cancel <run-id>
npx paperclipai run issues <run-id>
npx paperclipai run workspace-operations <run-id>
npx paperclipai run workspace-log <operation-id> [--text]
npx paperclipai run watchdog-decision <run-id> --decision continue --reason "..."
```

## 13.11 技能、密钥、成本、审批、活动、看板

```bash
npx paperclipai skills browse [--kind bundled|optional] [--category ...] [--query github]
npx paperclipai skills search "pull request" [--json]
npx paperclipai skills inspect <name>
npx paperclipai skills install <name> --company-id <id> [--as <alias>] [--force]
npx paperclipai skills import ./skills/my-skill --company-id <id>
npx paperclipai skills agent sync <agent-id> --skill <name> --mode add --company-id <id>

npx paperclipai secrets declarations|create|link|doctor|migrate-inline-env --company-id <id>

npx paperclipai approval list|get|create|approve|reject|request-revision|resubmit|comment
npx paperclipai activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
npx paperclipai dashboard get
npx paperclipai costs summary|by-agent|by-project --company-id <id>
```

## 13.12 实例设置与实验特性

```bash
npx paperclipai instance settings:general
npx paperclipai instance settings:general:update --payload-json '{...}'
npx paperclipai instance settings:experimental
npx paperclipai instance settings:experimental:update --payload-json '{...}'
```

> 实验特性是 **opt-in**，不提供兼容性保证，可能随时变化或移除，**风险自负**。

## 13.13 提示词交接（Prompt Handoff）

Prompt handoff **创建 Paperclip 工作**，不创建聊天会话。

```bash
npx paperclipai agent prompt --agent <agent> --api-key-env PAPERCLIP_API_KEY "Prompt here"
npx paperclipai agent-prompt <agent-name-or-id> <agent-api-key> "Prompt here"
npx paperclipai board prompt --company-id <id> --agent <agent> "Prompt here"
```

默认创建一条 `todo` 任务并指派、唤醒该 Agent；
`--issue <issue-id>` 改为给已有工作加评论，`--no-wake` 不触发唤醒。

下一步 → [第 14 章 REST API 速查](./14-rest-api-速查.md)
