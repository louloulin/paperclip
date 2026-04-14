/**
 * Ralph Budget Pre-check Service (T2.2)
 *
 * Ralph 适配器的预算预检服务。
 * 在 Ralph 执行前查询 Paperclip API 获取预算状态：
 * - 公司/Agent/项目级别的预算策略
 * - 软警告（utilization >= warnPercent 但 < 100%）
 * - 硬停止状态（utilization >= 100%）
 * - 预算利用率百分比
 *
 * 使用 Paperclip REST API (PAPERCLIP_API_KEY) 进行通信，
 * 遵循与 RalphTaskWritebackService 相同的 API 调用模式。
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetPolicyInfo {
  policyId: string;
  scopeType: "company" | "agent" | "project";
  scopeId: string;
  scopeName: string;
  metric: string;
  windowKind: string;
  amount: number;
  observedAmount: number;
  remainingAmount: number;
  utilizationPercent: number;
  warnPercent: number;
  hardStopEnabled: boolean;
  status: "ok" | "warning" | "hard_stop";
  windowStart: string;
  windowEnd: string;
}

export interface BudgetSoftWarning {
  scopeType: "company" | "agent" | "project";
  scopeId: string;
  scopeName: string;
  metric: string;
  utilizationPercent: number;
  warnPercent: number;
  amount: number;
  observedAmount: number;
  remainingAmount: number;
  message: string;
}

export interface BudgetHardStop {
  scopeType: "company" | "agent" | "project";
  scopeId: string;
  scopeName: string;
  reason: string;
}

export interface RalphBudgetPrecheckResult {
  companyId: string;
  agentId: string;
  projectId: string | null;
  checkedAt: string;
  companyPolicy: BudgetPolicyInfo | null;
  agentPolicy: BudgetPolicyInfo | null;
  projectPolicy: BudgetPolicyInfo | null;
  softWarnings: BudgetSoftWarning[];
  hardStop: BudgetHardStop | null;
  hasWarnings: boolean;
  hasHardStop: boolean;
}

// ---------------------------------------------------------------------------
// RalphBudgetService
// ---------------------------------------------------------------------------

/**
 * Ralph Budget Pre-check Service
 *
 * 在 Ralph 执行前调用 Paperclip API 获取预算状态。
 * 不执行硬停止（硬停止由 Paperclip Heartbeat 的 getInvocationBlock 处理），
 * 仅返回预算警告和利用率信息供 Ralph adapter 使用。
 */
export class RalphBudgetService {
  private apiUrl: string;
  private apiKey: string;
  private companyId: string;
  private agentId: string;

  constructor(options: {
    companyId: string;
    agentId: string;
    apiUrl?: string;
    apiKey?: string;
  }) {
    this.companyId = options.companyId;
    this.agentId = options.agentId;
    this.apiUrl =
      options.apiUrl ||
      process.env.PAPERCLIP_API_URL ||
      `${process.env.PAPERCLIP_SERVER_URL || "http://localhost:3000"}/api`;
    this.apiKey = options.apiKey || process.env.PAPERCLIP_API_KEY || "";
  }

  /**
   * 执行 GET 请求到 Paperclip API
   */
  private async apiGet<T>(path: string): Promise<T | null> {
    if (!this.apiKey) return null;
    try {
      const url = `${this.apiUrl}${path}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  /**
   * 执行预算预检
   *
   * 调用 GET /api/companies/:companyId/agents/:agentId/budget-precheck
   * 获取公司、Agent、项目级别的预算状态。
   *
   * @param projectId 可选的项目 ID
   * @returns 预算预检结果，包含软警告和硬停止信息
   */
  async precheck(projectId?: string | null): Promise<RalphBudgetPrecheckResult | null> {
    const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    return this.apiGet<RalphBudgetPrecheckResult>(
      `/companies/${this.companyId}/agents/${this.agentId}/budget-precheck${params}`,
    );
  }

  /**
   * 检查是否有活动的预算策略
   *
   * 快速检查是否存在需要关注的预算配置。
   * 如果返回 true，表示有预算策略存在。
   */
  async hasActivePolicy(): Promise<boolean> {
    const result = await this.precheck();
    if (!result) return false;
    return (
      result.companyPolicy !== null ||
      result.agentPolicy !== null ||
      result.projectPolicy !== null
    );
  }

  /**
   * 获取预算摘要
   *
   * 返回人类可读的预算状态摘要。
   * 适合在 Ralph 执行结果中展示。
   */
  async getBudgetSummary(): Promise<string | null> {
    const result = await this.precheck();
    if (!result) return null;

    const lines: string[] = ["📊 Budget Status:"];

    if (result.companyPolicy) {
      const p = result.companyPolicy;
      lines.push(
        `  Company: ${p.utilizationPercent}% used ($${(p.observedAmount / 100).toFixed(2)} / $${(p.amount / 100).toFixed(2)})`,
      );
    }

    if (result.agentPolicy) {
      const p = result.agentPolicy;
      lines.push(
        `  Agent: ${p.utilizationPercent}% used ($${(p.observedAmount / 100).toFixed(2)} / $${(p.amount / 100).toFixed(2)})`,
      );
    }

    if (result.projectPolicy) {
      const p = result.projectPolicy;
      lines.push(
        `  Project: ${p.utilizationPercent}% used ($${(p.observedAmount / 100).toFixed(2)} / $${(p.amount / 100).toFixed(2)})`,
      );
    }

    if (result.softWarnings.length > 0) {
      lines.push(`⚠️  ${result.softWarnings.length} soft warning(s):`);
      for (const w of result.softWarnings) {
        lines.push(`   - ${w.message}`);
      }
    }

    if (result.hasHardStop) {
      lines.push(`🚫 Hard stop: ${result.hardStop!.reason}`);
    }

    return lines.join("\n");
  }
}
