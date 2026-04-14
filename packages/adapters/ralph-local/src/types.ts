/**
 * Ralph × Paperclip 集成类型定义
 *
 * RalphPaperclipAdapter 是连接 Paperclip 控制平面与 Ralph 编排引擎的核心接口。
 * 负责处理心跳事件、任务状态管理和记忆同步。
 */

// ============================================================
// 核心类型定义
// ============================================================

/**
 * 心跳事件 - Paperclip 触发 Ralph 执行的任务事件
 */
export interface HeartbeatEvent {
  /** 事件唯一标识 */
  eventId: string;
  /** 触发的 Agent ID */
  agentId: string;
  /** 公司 ID */
  companyId: string;
  /** 心跳类型 */
  type: "scheduled" | "task_assigned" | "manual";
  /** 关联的任务 ID (如有) */
  taskId?: string;
  /** 事件时间戳 */
  timestamp: string;
  /** 事件元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Ralph 执行结果
 */
export interface RalphRunResult {
  /** 执行状态 */
  status: "success" | "error" | "blocked" | "cancelled";
  /** 执行的 Agent ID */
  agentId: string;
  /** 任务 ID */
  taskId?: string;
  /** 输出摘要 */
  summary?: string;
  /** Token 消耗 */
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
  /** 执行时间 (毫秒) */
  durationMs?: number;
  /** 错误信息 (如有) */
  error?: string;
  /** 创建的子任务 */
  createdSubtasks?: string[];
  /** 产生的记忆 */
  memories?: Memory[];
}

/**
 * 记忆条目 - 对应 Ralph 的 Pattern/Decision/Fix 记忆
 */
export interface Memory {
  /** 记忆 ID */
  id: string;
  /** 记忆类型 */
  type: "pattern" | "decision" | "fix" | "context";
  /** 记忆内容 */
  content: string;
  /** 关联标签 */
  tags: string[];
  /** 创建时间 */
  createdAt: string;
  /** 相关上下文 */
  context?: Record<string, unknown>;
}

/**
 * Hat Collection - Ralph 的任务执行配置集合
 */
export interface HatCollection {
  /** Collection 名称 */
  name: string;
  /** 包含的 Hats */
  hats: Hat[];
  /** 默认 Hat */
  defaultHat?: string;
  /** 配置元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Hat - Ralph 的单一任务处理单元
 */
export interface Hat {
  /** Hat 名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 执行提示词 */
  prompt: string;
  /** 工具权限 */
  tools?: HatTool[];
  /** 并发限制 */
  concurrency?: number;
}

/**
 * Hat 可用的工具
 */
export interface HatTool {
  /** 工具名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 工具配置 */
  config?: Record<string, unknown>;
}

/**
 * Memory Bank - Ralph 的记忆存储
 */
export interface MemoryBank {
  /** 模式记忆 */
  patterns: Memory[];
  /** 决策记忆 */
  decisions: Memory[];
  /** 修复记忆 */
  fixes: Memory[];
  /** 上下文记忆 */
  contexts: Memory[];
  /** 搜索历史 */
  searchHistory?: string[];
}

/**
 * 任务更新 - 更新 Paperclip Issue 状态
 */
export interface IssueUpdate {
  /** 状态 */
  status?: "todo" | "in_progress" | "in_review" | "done" | "blocked";
  /** 分配给 */
  assigneeId?: string;
  /** 优先级 */
  priority?: number;
  /** 评论 */
  comment?: string;
  /** 附件 */
  attachments?: Attachment[];
  /** 完成时间 */
  completedAt?: string;
}

/**
 * 附件
 */
export interface Attachment {
  /** 文件名 */
  filename: string;
  /** MIME 类型 */
  mimeType: string;
  /** 文件大小 (bytes) */
  size: number;
  /** 存储路径/URL */
  url: string;
}

/**
 * 成本事件 - 上报 Ralph 执行消耗
 */
export interface CostEvent {
  /** 事件 ID */
  eventId: string;
  /** Agent ID */
  agentId: string;
  /** 公司 ID */
  companyId: string;
  /** 任务 ID */
  taskId?: string;
  /** 成本类型 */
  costType: "token" | "api_call" | "storage" | "compute";
  /** 成本金额 */
  amount: number;
  /** 货币/单位 */
  currency: "tokens" | "usd" | "cny";
  /** 时间戳 */
  timestamp: string;
  /** 成本明细 */
  breakdown?: {
    inputTokens?: number;
    outputTokens?: number;
    apiCalls?: number;
    storageMb?: number;
    computeSeconds?: number;
  };
}

// ============================================================
// RalphPaperclipAdapter 核心接口
// ============================================================

/**
 * RalphPaperclipAdapter - Paperclip 与 Ralph 集成的核心适配器接口
 *
 * 包装 Ralph Loop Runner 为 Paperclip 可调用的服务，
 * 支持心跳驱动任务执行、任务状态管理和记忆同步。
 */
export interface RalphPaperclipAdapter {
  /** 适配器唯一标识 */
  readonly adapterId: string;
  /** 适配器版本 */
  readonly version: string;

  // --- 身份信息 ---
  /** 当前 Agent ID */
  agentId: string;
  /** 当前公司 ID */
  companyId: string;
  /** Hat Collection */
  hatCollection: HatCollection;
  /** Memory Bank */
  memoryBank: MemoryBank;

  // --- 初始化 ---
  /**
   * 初始化适配器
   * 加载 Paperclip Agent 配置和 Ralph Hat Collection
   */
  initialize(): Promise<void>;

  /**
   * 销毁适配器
   * 清理资源，保存状态
   */
  destroy(): Promise<void>;

  // --- 心跳处理 ---
  /**
   * 处理心跳事件
   * 接收 Paperclip 心跳，触发 Ralph 执行
   */
  onHeartbeat(event: HeartbeatEvent): Promise<RalphRunResult>;

  // --- 任务协调 ---
  /**
   * 检出任务
   * 将 Paperclip Issue 标记为 in_progress
   */
  checkoutIssue(issueId: string): Promise<void>;

  /**
   * 更新任务状态
   * 同步更新 Paperclip Issue 状态
   */
  updateIssue(issueId: string, update: IssueUpdate): Promise<void>;

  /**
   * 报告成本事件
   * 上报 Ralph 执行消耗给 Paperclip
   */
  reportCost(costEvent: CostEvent): Promise<void>;

  // --- 记忆管理 ---
  /**
   * 保存记忆
   * 将 Ralph 记忆同步到 Paperclip
   */
  saveMemory(memory: Memory): Promise<void>;

  /**
   * 搜索记忆
   * 在 Paperclip 知识库中搜索相关记忆
   */
  searchMemories(query: string, options?: SearchMemoriesOptions): Promise<Memory[]>;

  /**
   * 获取记忆银行
   * 获取当前所有记忆
   */
  getMemoryBank(): MemoryBank;

  // --- Scratchpad 管理 ---
  /**
   * 保存 Scratchpad
   * 持久化 Ralph 循环状态
   */
  saveScratchpad(scratchpad: ScratchpadState): Promise<void>;

  /**
   * 加载 Scratchpad
   * 恢复上次循环状态
   */
  loadScratchpad(): Promise<ScratchpadState | null>;
}

/**
 * 搜索记忆选项
 */
export interface SearchMemoriesOptions {
  /** 记忆类型过滤 */
  type?: Memory["type"];
  /** 标签过滤 */
  tags?: string[];
  /** 数量限制 */
  limit?: number;
  /** 时间范围 */
  timeRange?: {
    start: string;
    end: string;
  };
}

/**
 * Scratchpad 状态
 * Ralph Loop 的循环状态快照
 */
export interface ScratchpadState {
  /** 当前循环 ID */
  loopId: string;
  /** 当前 Hat */
  currentHat?: string;
  /** 循环次数 */
  loopCount: number;
  /** 上下文数据 */
  context: Record<string, unknown>;
  /** 上次执行摘要 */
  lastSummary?: string;
  /** 挂起的任务 */
  pendingTasks: string[];
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * Scratchpad 读取结果
 * Ralph Adapter 执行后读取的 scratchpad 数据
 */
export interface ScratchpadReadResult {
  /** Scratchpad 内容 */
  content: string;
  /** 文件路径 */
  path: string;
  /** 最后修改时间 */
  modifiedAt: string;
}

/**
 * Ralph 记忆同步结果
 * 包含 Ralph Memory Bank 中所有记忆的同步数据
 */
export interface MemorySyncResult {
  /** 所有记忆条目 */
  memories: MemoryEntry[];
  /** 总数 */
  total: number;
  /** 记忆文件路径 */
  memoriesPath: string;
  /** 最后修改时间 */
  modifiedAt: string;
  /** 同步时间戳 */
  syncedAt: string;
}

/**
 * 单个记忆条目
 */
export interface MemoryEntry {
  /** 记忆 ID */
  id: string;
  /** 记忆类型 */
  type: "pattern" | "decision" | "fix" | "context";
  /** 记忆内容 */
  content: string;
  /** 关联标签 */
  tags: string[];
  /** 创建时间 */
  createdAt: string;
}

/**
 * 记忆搜索选项
 */
export interface MemorySearchOptions {
  /** 记忆类型过滤 */
  type?: MemoryEntry["type"];
  /** 标签过滤 */
  tags?: string[];
  /** 关键词搜索 */
  query?: string;
  /** 数量限制 */
  limit?: number;
}

// ============================================================
// 适配器配置
// ============================================================

/**
 * Ralph Adapter 配置
 */
export interface RalphAdapterConfig {
  /** Paperclip API 基础 URL */
  apiBaseUrl: string;
  /** Paperclip API Key */
  apiKey: string;
  /** Ralph CLI 路径 (可选，默认 "ralph") */
  ralphPath?: string;
  /** Ralph 工作目录 */
  workingDirectory?: string;
  /** 默认超时 (秒) */
  defaultTimeoutSec?: number;
  /** 最大并发 */
  maxConcurrency?: number;
  /** 调试模式 */
  debug?: boolean;
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 RalphPaperclipAdapter 实例
 */
export interface RalphAdapterFactory {
  create(config: RalphAdapterConfig): Promise<RalphPaperclipAdapter>;
}

// ============================================================
// 工具函数类型
// ============================================================

/**
 * Ralph 工具调用结果
 */
export interface RalphToolResult {
  /** 工具名称 */
  tool: string;
  /** 执行状态 */
  success: boolean;
  /** 输出 */
  output?: string;
  /** 错误 */
  error?: string;
  /** 执行时间 */
  durationMs?: number;
}

/**
 * Ralph 工具接口
 * 定义 Ralph 可执行的工具能力
 */
export interface RalphTools {
  /** 文件读取 */
  read(path: string): Promise<string>;
  /** 文件编辑 */
  edit(path: string, oldString: string, newString: string): Promise<void>;
  /** Bash 命令执行 */
  bash(command: string, timeout?: number): Promise<string>;
  /** 搜索文件 */
  glob(pattern: string): Promise<string[]>;
  /** 搜索内容 */
  grep(pattern: string, path?: string): Promise<GrepResult[]>;
  /** 写入文件 */
  write(path: string, content: string): Promise<void>;
}

/**
 * Grep 结果
 */
export interface GrepResult {
  /** 文件路径 */
  file: string;
  /** 行号 */
  line: number;
  /** 匹配内容 */
  content: string;
}

// ============================================================
// 事件类型
// ============================================================

/**
 * Ralph 执行事件
 */
export interface RalphExecutionEvent {
  /** 事件类型 */
  type:
    | "loop.start"
    | "loop.end"
    | "hat.switch"
    | "task.start"
    | "task.complete"
    | "task.error"
    | "memory.created"
    | "cost.reported";
  /** 事件数据 */
  data: Record<string, unknown>;
  /** 时间戳 */
  timestamp: string;
}

/**
 * 事件处理器
 */
export interface RalphEventHandler {
  handle(event: RalphExecutionEvent): void;
}
