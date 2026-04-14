/**
 * Approval Chain Engine
 *
 * 链式审批流的核心引擎
 * 负责管理审批链的创建、步骤推进和状态转换
 */

import type { Db } from "@paperclipai/db";
import {
  approvalChains,
  approvalChainSteps,
  approvals,
} from "@paperclipai/db";
import { eq, and, asc } from "drizzle-orm";
import type {
  ApprovalChainType,
  ApprovalChainConfig,
  ApprovalChainDetail,
  ApprovalChainSummary,
  ApprovalChainStatus,
  CreateApprovalChainInput,
  AdvanceChainInput,
} from "./types.js";
import {
  AGENT_HIRE_CHAIN_TEMPLATE as AGENT_HIRE_CFG,
  BUDGET_EXCEED_CHAIN_TEMPLATE as BUDGET_EXCEED_CFG,
  STRATEGY_APPROVE_CHAIN_TEMPLATE as STRATEGY_APPROVE_CFG,
} from "./types.js";

/** 根据审批链类型获取默认配置 */
function getDefaultChainConfig(type: ApprovalChainType): ApprovalChainConfig {
  switch (type) {
    case "agent_hire_chain":
      return AGENT_HIRE_CFG;
    case "budget_exceed_chain":
      return BUDGET_EXCEED_CFG;
    case "strategy_approve_chain":
      return STRATEGY_APPROVE_CFG;
    case "board_level_chain":
      return {
        steps: [
          { name: "CEO 审批", requiredRole: "ceo" },
          { name: "董事会终审", requiredRole: "board" },
        ],
        timeoutHours: 168,
      };
    default:
      return { steps: [] };
  }
}

type ChainRecord = typeof approvalChains.$inferSelect;
type StepRecord = typeof approvalChainSteps.$inferSelect;

export function approvalChainEngine(db: Db) {
  // ============================================================
  // Create - 创建审批链
  // ============================================================

  async function createChain(
    companyId: string,
    input: CreateApprovalChainInput,
  ): Promise<{ chain: ChainRecord; steps: StepRecord[] }> {
    const config = input.config ?? getDefaultChainConfig(input.type);
    const name =
      input.name ??
      `${config.steps.length}步审批链`;

    // 1. 创建基础 Approval 记录（使用现有审批系统）
    const baseApproval = await db
      .insert(approvals)
      .values({
        companyId,
        type: mapChainTypeToApprovalType(input.type),
        requestedByAgentId: input.requestedByAgentId ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        status: "pending",
        payload: (input.payload ?? {}) as Record<string, unknown>,
        decisionNote: null,
        decidedByUserId: null,
        decidedAt: null,
      })
      .returning()
      .then((rows) => rows[0]);

    // 2. 创建审批链记录
    const chain = await db
      .insert(approvalChains)
      .values({
        companyId,
        baseApprovalId: baseApproval.id,
        type: input.type,
        name,
        currentStepIndex: 0,
        status: "active",
        config,
        requestedByAgentId: input.requestedByAgentId ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
      })
      .returning()
      .then((rows) => rows[0]);

    // 3. 创建审批步骤记录
    const steps: StepRecord[] = [];
    for (let i = 0; i < config.steps.length; i++) {
      const step = await db
        .insert(approvalChainSteps)
        .values({
          chainId: chain.id,
          stepIndex: i,
          name: config.steps[i].name,
          requiredRole: config.steps[i].requiredRole,
          approvalId: i === 0 ? baseApproval.id : null,
          status: "pending",
        })
        .returning()
        .then((rows) => rows[0]);
      steps.push(step);
    }

    return { chain, steps };
  }

  // ============================================================
  // Read - 获取审批链
  // ============================================================

  async function getChainById(id: string): Promise<ChainRecord | null> {
    return db
      .select()
      .from(approvalChains)
      .where(eq(approvalChains.id, id))
      .then((rows) => rows[0] ?? null);
  }

  async function listChains(
    companyId: string,
    options?: { status?: ApprovalChainStatus; limit?: number },
  ): Promise<ApprovalChainSummary[]> {
    const conditions = [eq(approvalChains.companyId, companyId)];
    if (options?.status) {
      conditions.push(eq(approvalChains.status, options.status));
    }

    const chainRows = await db
      .select()
      .from(approvalChains)
      .where(and(...conditions))
      .orderBy(asc(approvalChains.createdAt))
      .limit(options?.limit ?? 100);

    const summaries: ApprovalChainSummary[] = [];
    for (const chain of chainRows) {
      const steps = await db
        .select()
        .from(approvalChainSteps)
        .where(eq(approvalChainSteps.chainId, chain.id))
        .orderBy(asc(approvalChainSteps.stepIndex));

      const approvedCount = steps.filter(
        (s) => s.status === "approved" || s.status === "skipped",
      ).length;

      const currentStep = steps[chain.currentStepIndex];
      summaries.push({
        id: chain.id,
        companyId: chain.companyId,
        type: chain.type as ApprovalChainType,
        name: chain.name,
        currentStepIndex: chain.currentStepIndex,
        currentStepName: currentStep?.name ?? null,
        currentStepRole: currentStep?.requiredRole ?? null,
        status: chain.status as ApprovalChainStatus,
        stepCount: steps.length,
        approvedStepCount: approvedCount,
        requestedByAgentId: chain.requestedByAgentId,
        requestedByUserId: chain.requestedByUserId,
        createdAt: chain.createdAt,
        updatedAt: chain.updatedAt,
      });
    }

    return summaries;
  }

  async function getChainDetail(id: string): Promise<ApprovalChainDetail | null> {
    const chain = await getChainById(id);
    if (!chain) return null;

    const steps = await db
      .select()
      .from(approvalChainSteps)
      .where(eq(approvalChainSteps.chainId, id))
      .orderBy(asc(approvalChainSteps.stepIndex));

    const approvedCount = steps.filter(
      (s) => s.status === "approved" || s.status === "skipped",
    ).length;
    const currentStep = steps[chain.currentStepIndex];

    return {
      id: chain.id,
      companyId: chain.companyId,
      type: chain.type as ApprovalChainType,
      name: chain.name,
      currentStepIndex: chain.currentStepIndex,
      currentStepName: currentStep?.name ?? null,
      currentStepRole: currentStep?.requiredRole ?? null,
      status: chain.status as ApprovalChainStatus,
      stepCount: steps.length,
      approvedStepCount: approvedCount,
      requestedByAgentId: chain.requestedByAgentId,
      requestedByUserId: chain.requestedByUserId,
      decidedByUserId: chain.decidedByUserId,
      decidedAt: chain.decidedAt,
      decisionNote: chain.decisionNote,
      createdAt: chain.createdAt,
      updatedAt: chain.updatedAt,
      config: chain.config as ApprovalChainConfig,
      steps: steps.map((s) => ({
        id: s.id,
        chainId: s.chainId,
        stepIndex: s.stepIndex,
        name: s.name,
        requiredRole: s.requiredRole,
        approvalId: s.approvalId,
        status: s.status as "pending" | "approved" | "rejected" | "skipped",
        decidedByUserId: s.decidedByUserId,
        decidedAt: s.decidedAt,
        decisionNote: s.decisionNote,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    };
  }

  // ============================================================
  // Update - 推进审批链
  // ============================================================

  /**
   * 推进审批链到下一步或完成
   */
  async function advanceChain(
    chainId: string,
    input: AdvanceChainInput,
  ): Promise<{
    chain: ChainRecord;
    step: StepRecord;
    isComplete: boolean;
    isRejected: boolean;
    baseApprovalId: string | null;
  }> {
    const chain = await getChainById(chainId);
    if (!chain) throw new Error(`Approval chain not found: ${chainId}`);
    if (chain.status !== "active") {
      throw new Error(`Chain is not active: ${chain.status}`);
    }

    const config = chain.config as ApprovalChainConfig;
    const currentStepIdx = chain.currentStepIndex;

    const steps = await db
      .select()
      .from(approvalChainSteps)
      .where(eq(approvalChainSteps.chainId, chainId))
      .orderBy(asc(approvalChainSteps.stepIndex));

    const currentStep = steps[currentStepIdx];
    if (!currentStep) throw new Error(`Current step not found: index=${currentStepIdx}`);

    const now = new Date();

    // 更新当前步骤状态
    const updatedStep = await db
      .update(approvalChainSteps)
      .set({
        status: input.skip ? "skipped" : "approved",
        decidedByUserId: input.decidedByUserId ?? null,
        decidedAt: now,
        decisionNote: input.skip
          ? (input.skipReason ?? null)
          : (input.decisionNote ?? null),
        updatedAt: now,
      })
      .where(
        and(
          eq(approvalChainSteps.id, currentStep.id),
          eq(approvalChainSteps.status, "pending"),
        ),
      )
      .returning()
      .then((rows) => rows[0]);

    const nextStepIdx = currentStepIdx + 1;

    if (nextStepIdx >= config.steps.length) {
      // 全部步骤完成 → 完成整个链 + 完成基础 Approval
      const finalChain = await db
        .update(approvalChains)
        .set({
          status: "completed",
          currentStepIndex: nextStepIdx - 1,
          decidedByUserId: input.decidedByUserId ?? null,
          decidedAt: now,
          decisionNote: input.decisionNote ?? null,
          updatedAt: now,
        })
        .where(eq(approvalChains.id, chainId))
        .returning()
        .then((rows) => rows[0]);

      if (chain.baseApprovalId) {
        await db
          .update(approvals)
          .set({
            status: "approved",
            decidedByUserId: input.decidedByUserId ?? null,
            decidedAt: now,
            decisionNote: input.decisionNote ?? null,
            updatedAt: now,
          })
          .where(eq(approvals.id, chain.baseApprovalId));
      }

      return {
        chain: finalChain,
        step: updatedStep,
        isComplete: true,
        isRejected: false,
        baseApprovalId: chain.baseApprovalId,
      };
    } else {
      // 还有下一步 → 推进到下一步
      const updatedChain = await db
        .update(approvalChains)
        .set({
          currentStepIndex: nextStepIdx,
          updatedAt: now,
        })
        .where(eq(approvalChains.id, chainId))
        .returning()
        .then((rows) => rows[0]);

      return {
        chain: updatedChain,
        step: updatedStep,
        isComplete: false,
        isRejected: false,
        baseApprovalId: chain.baseApprovalId,
      };
    }
  }

  /**
   * 拒绝整个审批链
   */
  async function rejectChain(
    chainId: string,
    input: { decidedByUserId?: string; decisionNote?: string },
  ): Promise<{ chain: ChainRecord; baseApprovalId: string | null }> {
    const chain = await getChainById(chainId);
    if (!chain) throw new Error(`Approval chain not found: ${chainId}`);
    if (chain.status !== "active") {
      throw new Error(`Chain is not active: ${chain.status}`);
    }

    const now = new Date();

    const updatedChain = await db
      .update(approvalChains)
      .set({
        status: "cancelled",
        decidedByUserId: input.decidedByUserId ?? null,
        decidedAt: now,
        decisionNote: input.decisionNote ?? null,
        updatedAt: now,
      })
      .where(eq(approvalChains.id, chainId))
      .returning()
      .then((rows) => rows[0]);

    await db
      .update(approvalChainSteps)
      .set({
        status: "rejected",
        decidedByUserId: input.decidedByUserId ?? null,
        decidedAt: now,
        decisionNote: input.decisionNote ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(approvalChainSteps.chainId, chainId),
          eq(approvalChainSteps.status, "pending"),
        ),
      );

    if (chain.baseApprovalId) {
      await db
        .update(approvals)
        .set({
          status: "rejected",
          decidedByUserId: input.decidedByUserId ?? null,
          decidedAt: now,
          decisionNote: input.decisionNote ?? null,
          updatedAt: now,
        })
        .where(eq(approvals.id, chain.baseApprovalId));
    }

    return { chain: updatedChain, baseApprovalId: chain.baseApprovalId };
  }

  /**
   * 获取当前等待审批的步骤对应的 Approval ID
   */
  async function getCurrentStepApproval(chainId: string): Promise<string | null> {
    const chain = await getChainById(chainId);
    if (!chain || !chain.baseApprovalId) return null;

    const steps = await db
      .select()
      .from(approvalChainSteps)
      .where(eq(approvalChainSteps.chainId, chainId))
      .orderBy(asc(approvalChainSteps.stepIndex));

    const currentStep = steps[chain.currentStepIndex];
    return currentStep?.approvalId ?? chain.baseApprovalId;
  }

  return {
    createChain,
    getChainById,
    listChains,
    getChainDetail,
    advanceChain,
    rejectChain,
    getCurrentStepApproval,
  };
}

/** 将链类型映射到现有 Approval 类型 */
function mapChainTypeToApprovalType(chainType: ApprovalChainType): string {
  switch (chainType) {
    case "agent_hire_chain": return "hire_agent";
    case "budget_exceed_chain": return "budget_override_required";
    case "strategy_approve_chain": return "approve_ceo_strategy";
    case "board_level_chain": return "request_board_approval";
    default: return "request_board_approval";
  }
}
