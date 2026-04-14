/**
 * Approval Chain Types
 *
 * 链式审批的类型定义
 */

// ============================================================
// Chain Status
// ============================================================

export const APPROVAL_CHAIN_STATUSES = ["active", "completed", "cancelled"] as const;
export type ApprovalChainStatus = (typeof APPROVAL_CHAIN_STATUSES)[number];

export const APPROVAL_CHAIN_STEP_STATUSES = ["pending", "approved", "rejected", "skipped"] as const;
export type ApprovalChainStepStatus = (typeof APPROVAL_CHAIN_STEP_STATUSES)[number];

// ============================================================
// Chain Types
// ============================================================

/** 链式审批类型 */
export const APPROVAL_CHAIN_TYPES = [
  "agent_hire_chain",    // 招聘 Agent 多步审批
  "budget_exceed_chain", // 预算超限审批
  "strategy_approve_chain", // 战略审批
  "board_level_chain",    // 董事会级审批
] as const;
export type ApprovalChainType = (typeof APPROVAL_CHAIN_TYPES)[number];

// ============================================================
// Config Types
// ============================================================

/**
 * 审批链步骤定义（配置）
 */
export interface ApprovalChainStepDefinition {
  /** 步骤名称 */
  name: string;
  /** 要求的审批角色 */
  requiredRole: string;
  /** 是否可跳过（基于条件） */
  skippable?: boolean;
  /** 跳过条件 */
  skipCondition?: string;
  /** 超时小时数（覆盖全局） */
  timeoutHours?: number;
}

/**
 * 审批链配置
 */
export interface ApprovalChainConfig {
  /** 步骤定义列表 */
  steps: ApprovalChainStepDefinition[];
  /** 超时设置（小时） */
  timeoutHours?: number;
  /** 自动升级设置 */
  autoEscalation?: {
    enabled: boolean;
    afterHours?: number;
    escalateTo?: string;
  };
}

// ============================================================
// Predefined Chain Templates
// ============================================================

/** Agent Hire Chain: direct_manager → board */
export const AGENT_HIRE_CHAIN_TEMPLATE: ApprovalChainConfig = {
  steps: [
    {
      name: "直属上级审批",
      requiredRole: "direct_manager",
      skippable: true,
    },
    {
      name: "董事会终审",
      requiredRole: "board",
    },
  ],
  timeoutHours: 72,
  autoEscalation: {
    enabled: true,
    afterHours: 48,
    escalateTo: "board",
  },
};

/** Budget Exceed Chain: cfo → ceo → board */
export const BUDGET_EXCEED_CHAIN_TEMPLATE: ApprovalChainConfig = {
  steps: [
    {
      name: "CFO 审批",
      requiredRole: "cfo",
      skippable: false,
    },
    {
      name: "CEO 审批",
      requiredRole: "ceo",
      skippable: false,
    },
    {
      name: "董事会终审",
      requiredRole: "board",
      skippable: true,
    },
  ],
  timeoutHours: 24,
  autoEscalation: {
    enabled: true,
    afterHours: 12,
    escalateTo: "ceo",
  },
};

/** Strategy Approve Chain: cto/cfo → ceo → board */
export const STRATEGY_APPROVE_CHAIN_TEMPLATE: ApprovalChainConfig = {
  steps: [
    {
      name: "CTO/CFO 会审",
      requiredRole: "cto",
      skippable: true,
    },
    {
      name: "CEO 审批",
      requiredRole: "ceo",
    },
    {
      name: "董事会终审",
      requiredRole: "board",
      skippable: true,
    },
  ],
  timeoutHours: 168, // 1 week
};

// ============================================================
// API Input/Output Types
// ============================================================

/** 创建审批链的输入 */
export interface CreateApprovalChainInput {
  type: ApprovalChainType;
  name?: string;
  config?: ApprovalChainConfig;
  requestedByAgentId?: string | null;
  requestedByUserId?: string | null;
  payload?: Record<string, unknown>;
  issueIds?: string[];
}

/** 审批链摘要（列表用） */
export interface ApprovalChainSummary {
  id: string;
  companyId: string;
  type: ApprovalChainType;
  name: string | null;
  currentStepIndex: number;
  currentStepName: string | null;
  currentStepRole: string | null;
  status: ApprovalChainStatus;
  stepCount: number;
  approvedStepCount: number;
  requestedByAgentId: string | null;
  requestedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 审批链完整信息（含步骤） */
export interface ApprovalChainDetail extends ApprovalChainSummary {
  config: ApprovalChainConfig;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  steps: ApprovalChainStepDetail[];
}

/** 审批步骤详情 */
export interface ApprovalChainStepDetail {
  id: string;
  chainId: string;
  stepIndex: number;
  name: string;
  requiredRole: string;
  approvalId: string | null;
  status: ApprovalChainStepStatus;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 推进到下一步的输入 */
export interface AdvanceChainInput {
  decidedByUserId?: string;
  decisionNote?: string;
  /** 跳过当前步骤 */
  skip?: boolean;
  skipReason?: string;
}
