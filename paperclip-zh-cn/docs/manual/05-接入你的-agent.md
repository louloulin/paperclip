# 第 05 章　接入你的 Agent

> 英文原文：`docs/adapters/overview.md`、`docs/adapters/claude-local.md`、`docs/adapters/codex-local.md`、
> `docs/adapters/process.md`、`docs/adapters/http.md`、`docs/adapters/external-adapters.md`、`docs/adapters/creating-an-adapter.md`。

## 5.1 适配器是什么

适配器是「Paperclip 编排层」与「Agent 运行时」之间的桥。
心跳触发时 Paperclip 会：

1. 查该 Agent 的 `adapterType` 与 `adapterConfig`；
2. 用执行上下文调用适配器的 `execute()`；
3. 适配器拉起或调用 Agent 运行时；
4. 适配器捕获 stdout、解析用量与成本，返回结构化结果。

**核心判据：只要它能接收一次心跳，就可以被雇佣。**

## 5.2 内置适配器清单

| 适配器 | 类型键 | 说明 |
| --- | --- | --- |
| Claude Code | `claude_local` | 本地运行 Claude Code CLI；可用时走原生 ACP 引擎 |
| Codex | `codex_local` | 本地运行 OpenAI Codex CLI；可用时走原生 ACP 引擎 |
| Gemini CLI | `gemini_local` | 本地运行 Gemini CLI（实验性，适配器包已存在，尚未进入稳定类型枚举） |
| Kimi Code CLI | `kimi_local` | 通过 ACP 运行 Kimi Code CLI，可显式选择 headless `-p` 模式 |
| OpenCode | `opencode_local` | 本地运行 OpenCode CLI，支持多 provider 的 `provider/model` |
| Cursor | `cursor` | 以 background 模式运行 Cursor |
| Pi | `pi_local` | 本地内嵌运行 Pi Agent |
| Hermes | `hermes_local` | 通过 `@paperclipai/hermes-paperclip-adapter` 运行本地 Hermes CLI |
| Hermes Gateway | `hermes_gateway` | 通过同一包的 `/gateway` 入口调用已在运行的 Hermes API 服务 |
| OpenClaw Gateway | `openclaw_gateway` | 连接 OpenClaw 网关端点 |
| Process | `process` | 执行任意 shell 命令 |
| HTTP | `http` | 向外部 Agent 发送 webhook |

外部（插件）适配器示例：

| 适配器 | npm 包 | 类型键 |
| --- | --- | --- |
| Droid | `@henkey/droid-paperclip-adapter` | `droid_local` |

## 5.3 三种通用适配器写法

### `process` —— 跑任意命令

```json
{
  "adapterType": "process",
  "adapterConfig": {
    "command": "my-agent",
    "args": ["--prompt-file", "{promptFile}", "--json"],
    "cwd": "{workspacePath}",
    "env": { "AGENT_MODE": "paperclip" }
  }
}
```

要点：命令需在前台运行；把上下文用文件或 stdin 传进去，输出一行 JSON 作为结果。
退出码非 0 视为失败，可在 `adapterConfig` 里配置重试。

### `http` —— 打 webhook

```json
{
  "adapterType": "http",
  "adapterConfig": {
    "url": "https://my-bot.example.com/hooks/paperclip",
    "method": "POST",
    "headers": { "Content-Type": "application/json" },
    "timeoutMs": 120000
  }
}
```

Paperclip 会把执行上下文（任务、目标、祖先、预算、密钥注入结果）作为 JSON 发过去；
对方返回 2xx 即视为接受，响应体里的用量字段会被用于成本归因。

### `claude_local` / `codex_local` —— 本地 CLI

```json
{
  "adapterType": "claude_local",
  "adapterConfig": {
    "model": "sonnet",
    "permissionMode": "acceptEdits",
    "maxTurns": 60
  }
}
```

首次使用前请在本机确认 CLI 已安装并完成登录（`claude --version` / `codex --version`），
否则心跳会直接报认证失败。详见对应适配器文档。

## 5.4 凭据归属：最容易踩坑的地方

本地 CLI 适配器可以跑在三种目标上：Paperclip 宿主、SSH 目标、托管沙箱目标。
适配器会在启动 CLI **之前**决定哪份凭据是权威的：

| 适配器 | 凭据拓扑 | 托管沙箱目标上哪份凭据生效 |
| --- | --- | --- |
| `codex_local` | 宿主拥有 auth，写入托管的 `CODEX_HOME` | 宿主 `auth.json` 会被软链进托管目录并上传到沙箱；若该 Agent 配了 `OPENAI_API_KEY`，Paperclip 改为写 API key 版 `auth.json`，**该文件生效**。沙箱镜像里预置的登录会被遮蔽，因为 Codex 跑的是上传上去的 `CODEX_HOME`。 |
| `claude_local` | 快照拥有 auth，写入远程托管配置 | 若配了 `ANTHROPIC_API_KEY` 或 `CLAUDE_CODE_OAUTH_TOKEN`（来自 Agent 或环境 env），它压过任何已存登录；否则 Paperclip 只上传脱敏后的设置与技能/运行时资源，远程配置里没有凭据文件时会从沙箱镜像自己的 `$HOME/.claude` 复制 `.credentials.json` / `credentials.json`，**镜像里的登录生效**。 |

举例：

- **沙箱 Codex + 宿主 ChatGPT 登录**：宿主 `~/.codex/auth.json` 软链到托管目录并作为沙箱 `CODEX_HOME` 上传，Codex 读的是这份，镜像内自带的 `auth.json` 不会被用。
- **沙箱 Claude + 镜像自带登录**：Paperclip 物化远程 `CLAUDE_CONFIG_DIR`，缺失的凭据文件从镜像 `$HOME/.claude` 补齐，快照的 Claude 登录成为本次运行的凭据来源。

> 🔴 调试心法：成本异常或「Agent 说没登录」时，**先确认这次运行到底用了谁的凭据**，
> 再去改别的。改错地方只会让问题更隐蔽。

## 5.5 用非官方模型 / 网关

如果你用的是第三方网关或自定义模型，通过适配器配置指定 provider 与 model 即可：

- OpenCode：`opencode_local` 支持 `provider/model` 组合；
- 自建 HTTP Agent：用 `http` 适配器；
- 本地 Pi Agent：`pi_local` 直接复用 Pi 的 provider 配置。

> ⚠️ 经验之谈：**不要**设置会顶掉宿主 Agent 目录的「托管 provider 声明」环境变量。
> 那会用临时 `models.json` 覆盖整个本地 Agent 目录，把你已有的 provider、登录态和已安装扩展全部抹掉。
> 只有在「完全没有本地配置、需要从零声明网关」时才用那条路径。

## 5.6 编写自己的适配器

外部适配器是独立 npm 包，通过插件系统在启动时加载，**不需要改 Paperclip 源码**：

```bash
# 从 npm 安装
paperclipai plugin install <npm-package>

# 或从本地目录链接
paperclipai plugin install /path/to/my-adapter --local
```

开发步骤见 `docs/adapters/creating-an-adapter.md`，要点：

1. 实现 `execute(context)` 与 UI 解析器契约（用于在 UI 里流式展示 Agent 输出）；
2. 声明类型键（`typeKey`）与配置 schema；
3. 至少给出**反馈粒度**（feedback granularity）的实现，否则 UI 只能显示一个转圈；
4. 在宿主的能力目录中注册，通过插件能力审核后启用。

下一步 → [第 06 章 任务管理](./06-任务-issue-管理.md)
