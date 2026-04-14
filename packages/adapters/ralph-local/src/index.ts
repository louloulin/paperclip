/**
 * Ralph Paperclip Adapter Metadata
 *
 * Adapter type, models, and configuration documentation
 */

export const type = "ralph_local";
export const label = "Ralph Orchestrator";

export const models = [
  { id: "ralph-loop", label: "Ralph Loop (Multi-Hat)" },
];

/**
 * Ralph Adapter 支持的配置参数
 */
export const agentConfigurationDoc = `# ralph_local agent configuration

Adapter: ralph_local

Ralph 是一个多 Hat 编排引擎，支持并行任务执行、记忆系统和循环管理。

## Core fields

- \`hatCollection\` (string, optional): Hat Collection 名称或路径，默认 "default"
- \`defaultHat\` (string, optional): 默认执行的 Hat 名称
- \`workingDirectory\` (string, optional): Ralph 工作目录，默认使用项目根目录
- \`memoryBank\` (object, optional): 初始记忆银行配置

## Hat 配置

Hats 定义 Ralph 的任务执行角色和能力：

- \`hats\` (array): Hat 列表
  - \`name\` (string): Hat 名称
  - \`prompt\` (string): 执行提示词模板
  - \`tools\` (array): 启用的工具列表
  - \`concurrency\` (number): 并发限制

示例:
\`\`\`yaml
hats:
  - name: coder
    prompt: "你是一个专业程序员，负责实现代码任务"
    tools:
      - read
      - edit
      - bash
      - glob
      - grep
    concurrency: 2
  - name: reviewer
    prompt: "你是一个代码审查员，负责检查代码质量"
    tools:
      - read
      - glob
      - grep
\`\`\`

## Memory 配置

- \`memoryTypes\` (array): 启用的记忆类型 ["pattern", "decision", "fix", "context"]
- \`memoryTags\` (array): 默认标签

## Operational fields

- \`timeoutSec\` (number, optional): 运行超时时间（秒）
- \`graceSec\` (number, optional): 优雅关闭宽限期（秒）
- \`maxLoops\` (number, optional): 最大循环次数
- \`maxConcurrency\` (number, optional): 最大并发任务数

## Ralph 特定配置

- \`ralphPath\` (string, optional): Ralph CLI 路径，默认 "ralph"
- \`ralphConfig\` (string, optional): Ralph 配置文件路径
- \`scratchpadPath\` (string, optional): Scratchpad 存储路径

## 示例配置

\`\`\`json
{
  "adapter": "ralph_local",
  "hatCollection": "coder-reviewer",
  "defaultHat": "coder",
  "workingDirectory": "/path/to/project",
  "hats": [
    {
      "name": "coder",
      "prompt": "实现以下功能: {{task}}",
      "tools": ["read", "edit", "bash", "glob", "grep", "write"],
      "concurrency": 2
    }
  ],
  "timeoutSec": 300,
  "maxLoops": 10
}
\`\`\`

## Ralph × Paperclip 集成

Ralph Adapter 与 Paperclip 控制平面深度集成：

1. **心跳驱动执行**: Paperclip 心跳触发 Ralph Loop
2. **任务同步**: Ralph 创建的任务自动同步到 Paperclip Issues
3. **成本上报**: 执行消耗自动上报给 Paperclip 预算系统
4. **记忆沉淀**: Ralph 记忆自动同步到 Paperclip 知识库

## 环境变量

- \`PAPERCLIP_RUN_ID\`: 当前运行 ID
- \`PAPERCLIP_AGENT_ID\`: 当前 Agent ID
- \`PAPERCLIP_COMPANY_ID\`: 公司 ID
`;
