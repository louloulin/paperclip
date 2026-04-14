/**
 * Approval Chains Schema
 *
 * 链式审批流数据模型
 * 支持多步骤审批链（direct_manager → CFO → CEO → Board）
 */

import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

/**
 * 审批链 - 管理一组审批步骤的完整流程
 */
export const approvalChains = pgTable(
  "approval_chains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    /** 关联的基础审批 ID（最终指向单个 Approval 记录） */
    baseApprovalId: uuid("base_approval_id"),
    /** 审批类型 */
    type: text("type").notNull(),
    /** 链名称（如 "Agent Hire Chain"） */
    name: text("name"),
    /** 当前活跃步骤索引（从 0 开始） */
    currentStepIndex: integer("current_step_index").notNull().default(0),
    /** 链整体状态 */
    status: text("status").notNull().default("active"), // active | completed | cancelled
    /** 审批链配置（JSON）：步骤定义、超时设置等 */
    config: jsonb("config").$type<ApprovalChainConfig>().notNull().default({ steps: [] } as ApprovalChainConfig),
    /** 请求者 Agent ID */
    requestedByAgentId: uuid("requested_by_agent_id").references(() => agents.id),
    /** 请求者 User ID */
    requestedByUserId: text("requested_by_user_id"),
    /** 最终决定的 User ID */
    decidedByUserId: text("decided_by_user_id"),
    /** 最终决定时间 */
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** 决策备注 */
    decisionNote: text("decision_note"),
    /** 创建时间 */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** 更新时间 */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("approval_chains_company_status_idx").on(
      table.companyId,
      table.status,
    ),
    companyTypeIdx: index("approval_chains_company_type_idx").on(
      table.companyId,
      table.type,
    ),
  }),
);

/**
 * 审批链步骤 - 单个审批步骤的记录
 */
export const approvalChainSteps = pgTable(
  "approval_chain_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chainId: uuid("chain_id").notNull().references(() => approvalChains.id, { onDelete: "cascade" }),
    /** 步骤序号（从 0 开始） */
    stepIndex: integer("step_index").notNull(),
    /** 步骤名称 */
    name: text("name").notNull(),
    /** 审批角色要求（如 "direct_manager", "cfo", "ceo", "board"） */
    requiredRole: text("required_role").notNull(),
    /** 对应的 Paperclip Approval ID（单个 Approval 记录） */
    approvalId: uuid("approval_id"),
    /** 步骤状态 */
    status: text("status").notNull().default("pending"), // pending | approved | rejected | skipped
    /** 决定者 User ID */
    decidedByUserId: text("decided_by_user_id"),
    /** 决定时间 */
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** 决定备注 */
    decisionNote: text("decision_note"),
    /** 创建时间 */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** 更新时间 */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chainStepIdx: index("approval_chain_steps_chain_idx").on(table.chainId, table.stepIndex),
  }),
);

// ============================================================
// 配置类型
// ============================================================

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
