/**
 * Ralph Adapter Server
 *
 * Ralph 适配器的服务端实现
 * 处理 Paperclip 与 Ralph 之间的通信
 */

import type {
  RalphPaperclipAdapter,
  RalphAdapterConfig,
  HeartbeatEvent,
  RalphRunResult,
  CostEvent,
  Memory,
  RalphExecutionEvent,
  RalphEventHandler,
  HatCollection,
  Hat,
  MemoryBank,
  ScratchpadState,
  IssueUpdate,
  SearchMemoriesOptions,
} from "../types.js";

/**
 * Ralph Adapter Server 实现
 *
 * 提供完整的 Paperclip ↔ Ralph 集成能力：
 * - 心跳事件处理
 * - 任务状态同步
 * - 成本上报
 * - 记忆管理
 */
export class RalphAdapterServer implements RalphPaperclipAdapter {
  readonly adapterId: string;
  readonly version: string = "0.1.0";
  agentId: string = "";
  companyId: string = "";
  hatCollection: HatCollection = { name: "", hats: [] };
  memoryBank: MemoryBank = { patterns: [], decisions: [], fixes: [], contexts: [] };
  private config: RalphAdapterConfig;
  private eventHandlers: RalphEventHandler[] = [];
  private initialized: boolean = false;

  constructor(config: RalphAdapterConfig) {
    this.adapterId = `ralph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // TODO: 从 Paperclip API 加载 Agent 配置
    // TODO: 初始化 Ralph CLI 连接
    // TODO: 加载 Hat Collection

    this.initialized = true;
    this.emit({ type: "loop.start", data: { adapterId: this.adapterId }, timestamp: new Date().toISOString() });
  }

  async destroy(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // TODO: 保存状态到 Paperclip
    // TODO: 清理 Ralph 进程

    this.initialized = false;
    this.emit({ type: "loop.end", data: { adapterId: this.adapterId }, timestamp: new Date().toISOString() });
  }

  async onHeartbeat(event: HeartbeatEvent): Promise<RalphRunResult> {
    this.checkInitialized();

    this.emit({
      type: "task.start",
      data: { eventId: event.eventId, agentId: event.agentId, taskId: event.taskId },
      timestamp: new Date().toISOString(),
    });

    try {
      // TODO: 启动 Ralph Loop 执行
      // TODO: 处理任务
      // TODO: 返回执行结果

      const result: RalphRunResult = {
        status: "success",
        agentId: this.agentId,
        taskId: event.taskId,
        summary: "Ralph 执行完成",
        tokensUsed: { input: 0, output: 0, total: 0 },
        durationMs: 0,
      };

      this.emit({
        type: "task.complete",
        data: { eventId: event.eventId, result },
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.emit({
        type: "task.error",
        data: { eventId: event.eventId, error: errorMessage },
        timestamp: new Date().toISOString(),
      });

      return {
        status: "error",
        agentId: this.agentId,
        taskId: event.taskId,
        error: errorMessage,
      };
    }
  }

  async checkoutIssue(issueId: string): Promise<void> {
    this.checkInitialized();
    // TODO: PATCH /api/issues/{issueId} { status: "in_progress", assigneeId: this.agentId }
  }

  async updateIssue(issueId: string, update: IssueUpdate): Promise<void> {
    this.checkInitialized();
    // TODO: PATCH /api/issues/{issueId} with update
  }

  async reportCost(costEvent: CostEvent): Promise<void> {
    this.checkInitialized();

    this.emit({
      type: "cost.reported",
      data: { eventId: costEvent.eventId, amount: costEvent.amount },
      timestamp: new Date().toISOString(),
    });

    // TODO: POST /api/cost-events
  }

  async saveMemory(memory: Memory): Promise<void> {
    this.checkInitialized();

    // 将记忆添加到对应的类型数组
    switch (memory.type) {
      case "pattern":
        this.memoryBank.patterns.push(memory);
        break;
      case "decision":
        this.memoryBank.decisions.push(memory);
        break;
      case "fix":
        this.memoryBank.fixes.push(memory);
        break;
      case "context":
        this.memoryBank.contexts.push(memory);
        break;
    }

    this.emit({
      type: "memory.created",
      data: { memoryId: memory.id, type: memory.type },
      timestamp: new Date().toISOString(),
    });

    // TODO: 同步到 Paperclip Knowledge Base
  }

  async searchMemories(query: string, options?: SearchMemoriesOptions): Promise<Memory[]> {
    this.checkInitialized();

    // TODO: 实现记忆搜索
    // 1. 搜索本地记忆库
    // 2. 搜索 Paperclip Knowledge Base
    // 3. 返回合并结果

    return [];
  }

  getMemoryBank(): MemoryBank {
    return this.memoryBank;
  }

  async saveScratchpad(scratchpad: ScratchpadState): Promise<void> {
    this.checkInitialized();
    // TODO: 保存到 Paperclip attachment 表
  }

  async loadScratchpad(): Promise<ScratchpadState | null> {
    this.checkInitialized();
    // TODO: 从 Paperclip 加载 Scratchpad
    return null;
  }

  /**
   * 注册事件处理器
   */
  onEvent(handler: RalphEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * 注销事件处理器
   */
  offEvent(handler: RalphEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  private emit(event: RalphExecutionEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler.handle(event);
      } catch {
        // 忽略处理器错误
      }
    }
  }

  private checkInitialized(): void {
    if (!this.initialized) {
      throw new Error("RalphAdapterServer not initialized. Call initialize() first.");
    }
  }
}

/**
 * 创建 Ralph Adapter Server 实例
 */
export async function createRalphAdapter(config: RalphAdapterConfig): Promise<RalphPaperclipAdapter> {
  const adapter = new RalphAdapterServer(config);
  await adapter.initialize();
  return adapter;
}
