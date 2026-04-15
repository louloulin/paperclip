import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import {
  collaborationSessions,
  collaborationParticipants,
  taskDelegations,
  knowledgeShares,
  agentMessages,
  agents,
  issues,
} from "@paperclipai/db";
import { eq, desc, and, or, isNull, sql, ilike } from "drizzle-orm";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

// ---- Validation Schemas ----

const createSessionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(["project", "task_force", "knowledge_share", "ad_hoc"]).default("project"),
  coordinatorAgentId: z.string().uuid().optional(),
  parentIssueId: z.string().uuid().optional(),
  participantIds: z.array(z.string().uuid()).min(1).default([]),
  config: z.record(z.unknown()).optional(),
});

const delegateTaskSchema = z.object({
  fromAgentId: z.string().uuid(),
  toAgentId: z.string().uuid(),
  issueId: z.string().uuid().optional(),
  taskType: z.enum(["delegation", "subtask", "review", "approval_request"]).default("delegation"),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  costAttribution: z.enum(["to_agent", "to_department", "to_session"]).default("to_agent"),
  deadline: z.string().datetime().optional(),
  sessionId: z.string().uuid().optional(),
});

const shareKnowledgeSchema = z.object({
  fromAgentId: z.string().uuid(),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  category: z.enum(["insight", "pattern", "decision", "fix", "context", "procedure"]).default("insight"),
  visibility: z.enum(["private", "team", "department", "company"]).default("team"),
  targetAgentId: z.string().uuid().optional(),
  targetDepartmentId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
});

const sendMessageSchema = z.object({
  fromAgentId: z.string().uuid(),
  toAgentId: z.string().uuid(),
  messageType: z.enum(["message", "notification", "request", "response", "broadcast"]).default("message"),
  content: z.string().min(1).max(5000),
  metadata: z.record(z.unknown()).optional(),
  sessionId: z.string().uuid().optional(),
});

const updateDelegationStatusSchema = z.object({
  status: z.enum(["accepted", "rejected", "completed", "cancelled"]),
  result: z.record(z.unknown()).optional(),
});

const addParticipantSchema = z.object({
  agentId: z.string().uuid(),
  role: z.enum(["coordinator", "member", "observer"]).default("member"),
});

export function agentCollaborationRoutes(db: Db) {
  const router = Router();

  // ======== Collaboration Sessions ========

  /**
   * List collaboration sessions
   * GET /api/companies/:companyId/collaboration-sessions
   */
  router.get("/companies/:companyId/collaboration-sessions", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;

    const conditions = [eq(collaborationSessions.companyId, companyId)];
    if (status) conditions.push(eq(collaborationSessions.status, status));
    if (type) conditions.push(eq(collaborationSessions.type, type));

    const sessions = await db
      .select()
      .from(collaborationSessions)
      .where(and(...conditions))
      .orderBy(desc(collaborationSessions.createdAt))
      .limit(50);

    // Enrich with participant count
    const enriched = await Promise.all(
      sessions.map(async (session) => {
        const participants = await db
          .select({ agentId: collaborationParticipants.agentId, role: collaborationParticipants.role, status: collaborationParticipants.status })
          .from(collaborationParticipants)
          .where(eq(collaborationParticipants.sessionId, session.id));
        return { ...session, participantCount: participants.length, participants };
      }),
    );

    res.json(enriched);
  });

  /**
   * Create collaboration session
   * POST /api/companies/:companyId/collaboration-sessions
   */
  router.post(
    "/companies/:companyId/collaboration-sessions",
    validate(createSessionSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const { title, description, type, coordinatorAgentId, parentIssueId, participantIds, config } = req.body;

      // Validate agents belong to company
      if (coordinatorAgentId) {
        const [agent] = await db.select().from(agents).where(and(eq(agents.id, coordinatorAgentId), eq(agents.companyId, companyId))).limit(1);
        if (!agent) { res.status(400).json({ error: "Coordinator agent not found" }); return; }
      }

      const [session] = await db
        .insert(collaborationSessions)
        .values({
          companyId,
          title,
          description: description || null,
          type,
          coordinatorAgentId: coordinatorAgentId || null,
          parentIssueId: parentIssueId || null,
          config: config || {},
          createdByUserId: (req as any).auth?.userId || null,
        })
        .returning();

      // Add coordinator as participant
      if (coordinatorAgentId) {
        await db.insert(collaborationParticipants).values({
          sessionId: session.id,
          agentId: coordinatorAgentId,
          role: "coordinator",
          status: "active",
          joinedAt: new Date(),
        });
      }

      // Add other participants
      const otherIds = participantIds.filter((id: string) => id !== coordinatorAgentId);
      if (otherIds.length > 0) {
        await db.insert(collaborationParticipants).values(
          otherIds.map((agentId: string) => ({
            sessionId: session.id,
            agentId,
            role: "member" as const,
            status: "invited" as const,
          })),
        );
      }

      const participants = await db
        .select()
        .from(collaborationParticipants)
        .where(eq(collaborationParticipants.sessionId, session.id));

      res.status(201).json({ ...session, participantCount: participants.length, participants });
    },
  );

  /**
   * Get session details
   * GET /api/collaboration-sessions/:id
   */
  router.get("/collaboration-sessions/:id", async (req, res) => {
    const sessionId = req.params.id as string;
    const [session] = await db.select().from(collaborationSessions).where(eq(collaborationSessions.id, sessionId)).limit(1);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    assertCompanyAccess(req, session.companyId);

    const participants = await db
      .select()
      .from(collaborationParticipants)
      .where(eq(collaborationParticipants.sessionId, sessionId));

    res.json({ ...session, participants });
  });

  /**
   * Update session status
   * PATCH /api/collaboration-sessions/:id
   */
  router.patch("/collaboration-sessions/:id", async (req, res) => {
    const sessionId = req.params.id as string;
    const [session] = await db.select().from(collaborationSessions).where(eq(collaborationSessions.id, sessionId)).limit(1);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    assertCompanyAccess(req, session.companyId);

    const { status, result } = req.body;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (status) updateData.status = status;
    if (result) updateData.result = result;
    if (status === "completed" || status === "cancelled") updateData.completedAt = new Date();

    const [updated] = await db
      .update(collaborationSessions)
      .set(updateData)
      .where(eq(collaborationSessions.id, sessionId))
      .returning();

    res.json(updated);
  });

  /**
   * Add participant to session
   * POST /api/collaboration-sessions/:id/participants
   */
  router.post(
    "/collaboration-sessions/:id/participants",
    validate(addParticipantSchema),
    async (req, res) => {
      const sessionId = req.params.id as string;
      const [session] = await db.select().from(collaborationSessions).where(eq(collaborationSessions.id, sessionId)).limit(1);
      if (!session) { res.status(404).json({ error: "Session not found" }); return; }

      assertCompanyAccess(req, session.companyId);

      const { agentId, role } = req.body;

      const [existing] = await db
        .select()
        .from(collaborationParticipants)
        .where(and(eq(collaborationParticipants.sessionId, sessionId), eq(collaborationParticipants.agentId, agentId)))
        .limit(1);

      if (existing) { res.status(409).json({ error: "Agent already a participant" }); return; }

      const [participant] = await db
        .insert(collaborationParticipants)
        .values({ sessionId, agentId, role, status: "invited" })
        .returning();

      res.status(201).json(participant);
    },
  );

  /**
   * Remove participant from session
   * DELETE /api/collaboration-sessions/:sessionId/participants/:participantId
   */
  router.delete("/collaboration-sessions/:sessionId/participants/:participantId", async (req, res) => {
    const { sessionId, participantId } = req.params;
    const [session] = await db.select().from(collaborationSessions).where(eq(collaborationSessions.id, sessionId)).limit(1);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    assertCompanyAccess(req, session.companyId);

    await db
      .update(collaborationParticipants)
      .set({ status: "removed", leftAt: new Date() })
      .where(and(eq(collaborationParticipants.id, participantId), eq(collaborationParticipants.sessionId, sessionId)));

    res.json({ success: true });
  });

  // ======== Task Delegations ========

  /**
   * List delegations
   * GET /api/companies/:companyId/task-delegations
   */
  router.get("/companies/:companyId/task-delegations", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const status = req.query.status as string | undefined;
    const agentId = req.query.agentId as string | undefined;

    const conditions = [eq(taskDelegations.companyId, companyId)];
    if (status) conditions.push(eq(taskDelegations.status, status));
    if (agentId) conditions.push(or(eq(taskDelegations.fromAgentId, agentId), eq(taskDelegations.toAgentId, agentId))!);

    const delegations = await db
      .select()
      .from(taskDelegations)
      .where(and(...conditions))
      .orderBy(desc(taskDelegations.createdAt))
      .limit(50);

    res.json(delegations);
  });

  /**
   * Delegate task
   * POST /api/companies/:companyId/task-delegations
   */
  router.post(
    "/companies/:companyId/task-delegations",
    validate(delegateTaskSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const { fromAgentId, toAgentId, issueId, taskType, title, description, priority, costAttribution, deadline, sessionId } = req.body;

      // Validate both agents
      const [fromAgent] = await db.select().from(agents).where(and(eq(agents.id, fromAgentId), eq(agents.companyId, companyId))).limit(1);
      if (!fromAgent) { res.status(400).json({ error: "Source agent not found" }); return; }

      const [toAgent] = await db.select().from(agents).where(and(eq(agents.id, toAgentId), eq(agents.companyId, companyId))).limit(1);
      if (!toAgent) { res.status(400).json({ error: "Target agent not found" }); return; }

      const [delegation] = await db
        .insert(taskDelegations)
        .values({
          companyId,
          issueId: issueId || null,
          fromAgentId,
          toAgentId,
          taskType,
          title,
          description: description || null,
          priority,
          costAttribution,
          deadline: deadline ? new Date(deadline) : null,
          sessionId: sessionId || null,
        })
        .returning();

      // Create notification message
      await db.insert(agentMessages).values({
        companyId,
        sessionId: delegation.sessionId,
        delegationId: delegation.id,
        fromAgentId,
        toAgentId,
        messageType: "notification",
        content: `Task delegated: ${title}`,
        metadata: { delegationId: delegation.id, taskType, priority },
      });

      res.status(201).json(delegation);
    },
  );

  /**
   * Update delegation status (accept/reject/complete/cancel)
   * PATCH /api/task-delegations/:id/status
   */
  router.patch(
    "/task-delegations/:id/status",
    validate(updateDelegationStatusSchema),
    async (req, res) => {
      const delegationId = req.params.id as string;
      const { status, result } = req.body;

      const [delegation] = await db.select().from(taskDelegations).where(eq(taskDelegations.id, delegationId)).limit(1);
      if (!delegation) { res.status(404).json({ error: "Delegation not found" }); return; }

      assertCompanyAccess(req, delegation.companyId);

      const updateData: Record<string, unknown> = { status, updatedAt: new Date() };
      if (result) updateData.result = result;
      if (status === "accepted") updateData.acceptedAt = new Date();
      if (status === "completed") updateData.completedAt = new Date();

      const [updated] = await db
        .update(taskDelegations)
        .set(updateData)
        .where(eq(taskDelegations.id, delegationId))
        .returning();

      // Notify source agent
      await db.insert(agentMessages).values({
        companyId: delegation.companyId,
        sessionId: delegation.sessionId,
        delegationId: delegation.id,
        fromAgentId: delegation.toAgentId,
        toAgentId: delegation.fromAgentId,
        messageType: "response",
        content: `Task ${status}: ${delegation.title}`,
        metadata: { delegationId, newStatus: status },
      });

      res.json(updated);
    },
  );

  // ======== Knowledge Sharing ========

  /**
   * List knowledge shares
   * GET /api/companies/:companyId/knowledge-shares
   */
  router.get("/companies/:companyId/knowledge-shares", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const category = req.query.category as string | undefined;
    const q = req.query.q as string | undefined;
    const agentId = req.query.agentId as string | undefined;

    const conditions = [eq(knowledgeShares.companyId, companyId)];
    if (category) conditions.push(eq(knowledgeShares.category, category));
    if (agentId) conditions.push(eq(knowledgeShares.fromAgentId, agentId));
    if (q) conditions.push(or(ilike(knowledgeShares.title, `%${q}%`), ilike(knowledgeShares.content, `%${q}%`))!);

    const shares = await db
      .select()
      .from(knowledgeShares)
      .where(and(...conditions))
      .orderBy(desc(knowledgeShares.createdAt))
      .limit(50);

    res.json(shares);
  });

  /**
   * Share knowledge
   * POST /api/companies/:companyId/knowledge-shares
   */
  router.post(
    "/companies/:companyId/knowledge-shares",
    validate(shareKnowledgeSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const { fromAgentId, title, content, category, visibility, targetAgentId, targetDepartmentId, tags } = req.body;

      const [share] = await db
        .insert(knowledgeShares)
        .values({
          companyId,
          fromAgentId,
          title,
          content,
          category,
          visibility,
          targetAgentId: targetAgentId || null,
          targetDepartmentId: targetDepartmentId || null,
          tags: tags || [],
        })
        .returning();

      res.status(201).json(share);
    },
  );

  /**
   * Access knowledge share (increment access count)
   * POST /api/knowledge-shares/:id/access
   */
  router.post("/knowledge-shares/:id/access", async (req, res) => {
    const shareId = req.params.id as string;
    const [share] = await db.select().from(knowledgeShares).where(eq(knowledgeShares.id, shareId)).limit(1);
    if (!share) { res.status(404).json({ error: "Knowledge share not found" }); return; }

    assertCompanyAccess(req, share.companyId);

    await db
      .update(knowledgeShares)
      .set({ accessCount: sql`${knowledgeShares.accessCount} + 1` })
      .where(eq(knowledgeShares.id, shareId));

    res.json({ ...share, accessCount: share.accessCount + 1 });
  });

  // ======== Agent Messages ========

  /**
   * Get messages for an agent
   * GET /api/companies/:companyId/agents/:agentId/messages
   */
  router.get("/companies/:companyId/agents/:agentId/messages", async (req, res) => {
    const { companyId, agentId } = req.params;
    assertCompanyAccess(req, companyId);

    const unreadOnly = req.query.unread === "true";

    const conditions = [eq(agentMessages.companyId, companyId), eq(agentMessages.toAgentId, agentId)];
    if (unreadOnly) conditions.push(isNull(agentMessages.readAt));

    const messages = await db
      .select()
      .from(agentMessages)
      .where(and(...conditions))
      .orderBy(desc(agentMessages.createdAt))
      .limit(50);

    res.json(messages);
  });

  /**
   * Send message between agents
   * POST /api/companies/:companyId/agent-messages
   */
  router.post(
    "/companies/:companyId/agent-messages",
    validate(sendMessageSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const { fromAgentId, toAgentId, messageType, content, metadata, sessionId } = req.body;

      const [message] = await db
        .insert(agentMessages)
        .values({
          companyId,
          fromAgentId,
          toAgentId,
          messageType,
          content,
          metadata: metadata || {},
          sessionId: sessionId || null,
        })
        .returning();

      res.status(201).json(message);
    },
  );

  /**
   * Mark message as read
   * PATCH /api/agent-messages/:id/read
   */
  router.patch("/agent-messages/:id/read", async (req, res) => {
    const messageId = req.params.id as string;
    const [message] = await db.select().from(agentMessages).where(eq(agentMessages.id, messageId)).limit(1);
    if (!message) { res.status(404).json({ error: "Message not found" }); return; }

    assertCompanyAccess(req, message.companyId);

    const [updated] = await db
      .update(agentMessages)
      .set({ readAt: new Date() })
      .where(eq(agentMessages.id, messageId))
      .returning();

    res.json(updated);
  });

  // ======== Statistics ========

  /**
   * Get collaboration statistics
   * GET /api/companies/:companyId/collaboration-stats
   */
  router.get("/companies/:companyId/collaboration-stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const [sessionStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${collaborationSessions.status} = 'active')::int`,
        completed: sql<number>`count(*) filter (where ${collaborationSessions.status} = 'completed')::int`,
      })
      .from(collaborationSessions)
      .where(eq(collaborationSessions.companyId, companyId));

    const [delegationStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${taskDelegations.status} = 'pending')::int`,
        completed: sql<number>`count(*) filter (where ${taskDelegations.status} = 'completed')::int`,
        totalCostCents: sql<number>`coalesce(sum(${taskDelegations.costCents}), 0)::int`,
      })
      .from(taskDelegations)
      .where(eq(taskDelegations.companyId, companyId));

    const [knowledgeStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        totalAccess: sql<number>`coalesce(sum(${knowledgeShares.accessCount}), 0)::int`,
      })
      .from(knowledgeShares)
      .where(eq(knowledgeShares.companyId, companyId));

    const [messageStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        unread: sql<number>`count(*) filter (where ${agentMessages.readAt} is null)::int`,
      })
      .from(agentMessages)
      .where(eq(agentMessages.companyId, companyId));

    res.json({
      sessions: sessionStats,
      delegations: delegationStats,
      knowledge: knowledgeStats,
      messages: messageStats,
    });
  });

  return router;
}
