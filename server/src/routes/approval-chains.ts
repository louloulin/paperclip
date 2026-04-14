/**
 * Approval Chain Routes
 *
 * 链式审批流的 REST API 路由
 */

import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { z } from "zod";
import { approvalChainEngine } from "../approval-chain/engine.js";
import { assertCompanyAccess, assertBoard, getActorInfo } from "./authz.js";
import { logActivity } from "../services/activity-log.js";
import { agentService, approvalService, heartbeatService } from "../services/index.js";
import type { ApprovalChainType, CreateApprovalChainInput } from "../approval-chain/types.js";
import { APPROVAL_CHAIN_TYPES } from "../approval-chain/types.js";

// ============================================================
// Input Validation Schemas
// ============================================================

const createChainSchema = z.object({
  type: z.enum(APPROVAL_CHAIN_TYPES as unknown as [string, ...string[]]),
  name: z.string().optional(),
  config: z.object({
    steps: z.array(
      z.object({
        name: z.string(),
        requiredRole: z.string(),
        skippable: z.boolean().optional(),
        skipCondition: z.string().optional(),
        timeoutHours: z.number().optional(),
      }),
    ),
    timeoutHours: z.number().optional(),
    autoEscalation: z
      .object({
        enabled: z.boolean(),
        afterHours: z.number().optional(),
        escalateTo: z.string().optional(),
      })
      .optional(),
  }).optional(),
  payload: z.record(z.unknown()).optional(),
  issueIds: z.array(z.string()).optional(),
});

const advanceChainSchema = z.object({
  decidedByUserId: z.string().optional(),
  decisionNote: z.string().optional(),
  skip: z.boolean().optional(),
  skipReason: z.string().optional(),
});

const rejectChainSchema = z.object({
  decidedByUserId: z.string().optional(),
  decisionNote: z.string().optional(),
});

export function approvalChainRoutes(db: Db) {
  const router = Router();
  const engine = approvalChainEngine(db);
  const agentSvc = agentService(db);
  const approvalsSvc = approvalService(db);
  const heartbeatSvc = heartbeatService(db);

  // ============================================================
  // List chains for a company
  // ============================================================

  router.get("/companies/:companyId/approval-chains", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const status = req.query.status as string | undefined;
    const chains = await engine.listChains(companyId, {
      status: status as "active" | "completed" | "cancelled" | undefined,
    });
    res.json(chains);
  });

  // ============================================================
  // Create a new approval chain
  // ============================================================

  router.post("/companies/:companyId/approval-chains", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = createChainSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const actor = getActorInfo(req);
    const input: CreateApprovalChainInput = {
      type: req.body.type as ApprovalChainType,
      name: req.body.name,
      config: req.body.config,
      requestedByAgentId: actor.actorType === "agent" ? actor.actorId : undefined,
      requestedByUserId: actor.actorType === "user" ? actor.actorId : undefined,
      payload: req.body.payload,
      issueIds: req.body.issueIds,
    };

    const { chain, steps } = await engine.createChain(companyId, input);

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "approval_chain.created",
      entityType: "approval_chain",
      entityId: chain.id,
      details: {
        type: chain.type,
        name: chain.name,
        stepCount: steps.length,
      },
    });

    // Return the full chain detail
    const detail = await engine.getChainDetail(chain.id);
    res.status(201).json(detail);
  });

  // ============================================================
  // Get a specific approval chain
  // ============================================================

  router.get("/approval-chains/:id", async (req, res) => {
    const id = req.params.id as string;
    const detail = await engine.getChainDetail(id);
    if (!detail) {
      res.status(404).json({ error: "Approval chain not found" });
      return;
    }
    assertCompanyAccess(req, detail.companyId);
    res.json(detail);
  });

  // ============================================================
  // Get the current pending step's approval (for the board UI)
  // ============================================================

  router.get("/approval-chains/:id/current-approval", async (req, res) => {
    const id = req.params.id as string;
    const detail = await engine.getChainDetail(id);
    if (!detail) {
      res.status(404).json({ error: "Approval chain not found" });
      return;
    }
    assertCompanyAccess(req, detail.companyId);

    const approvalId = await engine.getCurrentStepApproval(id);
    res.json({ chainId: id, currentApprovalId: approvalId });
  });

  // ============================================================
  // Advance the chain (approve current step)
  // ============================================================

  router.post("/approval-chains/:id/advance", async (req, res) => {
    const id = req.params.id as string;
    assertBoard(req);

    const detail = await engine.getChainDetail(id);
    if (!detail) {
      res.status(404).json({ error: "Approval chain not found" });
      return;
    }
    if (detail.status !== "active") {
      res.status(400).json({ error: `Chain is not active: ${detail.status}` });
      return;
    }

    const parsed = advanceChainSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const actor = getActorInfo(req);
    const { chain, step, isComplete, baseApprovalId } = await engine.advanceChain(id, {
      decidedByUserId: req.body.decidedByUserId ?? (actor.actorType === "user" ? actor.actorId : undefined),
      decisionNote: req.body.decisionNote,
      skip: req.body.skip,
      skipReason: req.body.skipReason,
    });

    // Sync agent status when chain completes
    if (isComplete && baseApprovalId) {
      const baseApproval = await approvalsSvc.getById(baseApprovalId);
      if (baseApproval) {
        const payload = baseApproval.payload as Record<string, unknown> | undefined;
        const agentId = payload?.agentId as string | undefined;
        if (agentId) {
          if (detail.type === "agent_hire_chain") {
            // Activate pending agent
            await agentSvc.update(agentId, { status: "idle" });
            await logActivity(db, {
              companyId: detail.companyId,
              actorType: "user",
              actorId: actor.actorType === "user" ? actor.actorId : "board",
              agentId: actor.agentId,
              action: "agent.hire_approved",
              entityType: "agent",
              entityId: agentId,
              details: { chainId: id },
            });
          } else if (detail.type === "agent_fire_chain") {
            // Terminate agent
            await agentSvc.update(agentId, { status: "terminated" });
            await heartbeatSvc.cancelActiveForAgent(agentId);
            await logActivity(db, {
              companyId: detail.companyId,
              actorType: "user",
              actorId: actor.actorType === "user" ? actor.actorId : "board",
              agentId: actor.agentId,
              action: "agent.terminated",
              entityType: "agent",
              entityId: agentId,
              details: { chainId: id },
            });
          }
        }
      }
    }

    await logActivity(db, {
      companyId: detail.companyId,
      actorType: "user",
      actorId: actor.actorType === "user" ? actor.actorId : "board",
      agentId: actor.agentId,
      action: isComplete ? "approval_chain.completed" : "approval_chain.step_advanced",
      entityType: "approval_chain",
      entityId: id,
      details: {
        stepIndex: step.stepIndex,
        stepName: step.name,
        isComplete,
        baseApprovalId,
      },
    });

    const updatedDetail = await engine.getChainDetail(id);
    res.json({
      chain: updatedDetail,
      isComplete,
      baseApprovalId,
    });
  });

  // ============================================================
  // Reject the entire chain
  // ============================================================

  router.post("/approval-chains/:id/reject", async (req, res) => {
    const id = req.params.id as string;
    assertBoard(req);

    const detail = await engine.getChainDetail(id);
    if (!detail) {
      res.status(404).json({ error: "Approval chain not found" });
      return;
    }
    if (detail.status !== "active") {
      res.status(400).json({ error: `Chain is not active: ${detail.status}` });
      return;
    }

    const parsed = rejectChainSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const actor = getActorInfo(req);
    const { chain, baseApprovalId } = await engine.rejectChain(id, {
      decidedByUserId: req.body.decidedByUserId ?? (actor.actorType === "user" ? actor.actorId : undefined),
      decisionNote: req.body.decisionNote,
    });

    await logActivity(db, {
      companyId: detail.companyId,
      actorType: "user",
      actorId: actor.actorType === "user" ? actor.actorId : "board",
      agentId: actor.agentId,
      action: "approval_chain.rejected",
      entityType: "approval_chain",
      entityId: id,
      details: {
        baseApprovalId,
        reason: req.body.decisionNote,
      },
    });

    const updatedDetail = await engine.getChainDetail(id);
    res.json({ chain: updatedDetail, baseApprovalId });
  });

  return router;
}
