import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { waves, waveEvents, agents } from "@paperclipai/db";
import { eq, desc, and } from "drizzle-orm";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { RalphWaveService } from "@paperclipai/adapter-ralph-local/server";

const dispatchWaveSchema = z.object({
  topic: z.string().min(1),
  payloads: z.array(z.string()).min(1),
  dispatchedBy: z.enum(["agent", "user"]).default("user"),
  agentId: z.string().uuid().optional(),
});

export function waveRoutes(db: Db) {
  const router = Router();
  const waveService = new RalphWaveService();

  /**
   * List waves for a company
   * GET /api/companies/:companyId/waves
   */
  router.get("/companies/:companyId/waves", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const status = req.query.status as string | undefined;

    const conditions = [eq(waves.companyId, companyId)];
    if (status) {
      conditions.push(eq(waves.status, status));
    }

    const result = await db
      .select()
      .from(waves)
      .where(and(...conditions))
      .orderBy(desc(waves.createdAt))
      .limit(50);

    res.json(result);
  });

  /**
   * Dispatch a wave
   * POST /api/companies/:companyId/waves
   */
  router.post(
    "/companies/:companyId/waves",
    validate(dispatchWaveSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const { topic, payloads, dispatchedBy, agentId } = req.body;

      // 验证 agentId 如果提供
      if (agentId) {
        const [agent] = await db
          .select()
          .from(agents)
          .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
          .limit(1);
        if (!agent) {
          res.status(400).json({ error: "Agent not found in this company" });
          return;
        }
      }

      // 创建 wave 记录
      const [wave] = await db
        .insert(waves)
        .values({
          companyId,
          topic,
          totalCount: payloads.length,
          completedCount: 0,
          failedCount: 0,
          status: "dispatching",
          dispatchedBy,
          createdByAgentId: agentId || null,
          createdByUserId: dispatchedBy === "user" ? (req as any).auth?.userId : null,
        })
        .returning();

      // 创建 wave_events 记录
      const events = await db
        .insert(waveEvents)
        .values(
          payloads.map((payload: string, index: number) => ({
            waveId: wave.id,
            payload: { text: payload, index },
            status: "pending",
          })),
        )
        .returning();

      // 执行 ralph wave emit
      const RalphResult = await waveService.dispatchWave({ topic, payloads });

      // 更新 wave 状态
      const newStatus = RalphResult.success ? "running" : "failed";
      await db
        .update(waves)
        .set({ status: newStatus })
        .where(eq(waves.id, wave.id));

      res.status(201).json({
        ...wave,
        status: newStatus,
        totalCount: payloads.length,
        completedCount: 0,
        failedCount: 0,
        events,
        ralphOutput: RalphResult.output || undefined,
        ralphError: RalphResult.error || undefined,
      });
    },
  );

  /**
   * Get wave details
   * GET /api/waves/:id
   */
  router.get("/waves/:id", async (req, res) => {
    const waveId = req.params.id as string;

    const [wave] = await db.select().from(waves).where(eq(waves.id, waveId)).limit(1);
    if (!wave) {
      res.status(404).json({ error: "Wave not found" });
      return;
    }

    assertCompanyAccess(req, wave.companyId);

    const events = await db
      .select()
      .from(waveEvents)
      .where(eq(waveEvents.waveId, waveId))
      .orderBy(waveEvents.createdAt);

    res.json({ ...wave, events });
  });

  /**
   * Get wave events
   * GET /api/waves/:id/events
   */
  router.get("/waves/:id/events", async (req, res) => {
    const waveId = req.params.id as string;

    const [wave] = await db.select().from(waves).where(eq(waves.id, waveId)).limit(1);
    if (!wave) {
      res.status(404).json({ error: "Wave not found" });
      return;
    }

    assertCompanyAccess(req, wave.companyId);

    const events = await db
      .select()
      .from(waveEvents)
      .where(eq(waveEvents.waveId, waveId))
      .orderBy(waveEvents.createdAt);

    res.json(events);
  });

  /**
   * Update wave event status (called by Ralph adapter)
   * PATCH /api/waves/:id/events/:eventId
   */
  router.patch("/waves/:waveId/events/:eventId", async (req, res) => {
    const { waveId, eventId } = req.params;

    const [event] = await db
      .select()
      .from(waveEvents)
      .where(and(eq(waveEvents.id, eventId), eq(waveEvents.waveId, waveId)))
      .limit(1);
    if (!event) {
      res.status(404).json({ error: "Wave event not found" });
      return;
    }

    const [wave] = await db.select().from(waves).where(eq(waves.id, waveId)).limit(1);
    if (!wave) {
      res.status(404).json({ error: "Wave not found" });
      return;
    }

    assertCompanyAccess(req, wave.companyId);

    const { status, agentId, runId, errorMessage } = req.body;

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (agentId) updateData.agentId = agentId;
    if (runId) updateData.runId = runId;
    if (errorMessage) updateData.errorMessage = errorMessage;
    if (status === "completed" || status === "failed") {
      updateData.processedAt = new Date();
    }

    const [updated] = await db
      .update(waveEvents)
      .set(updateData)
      .where(and(eq(waveEvents.id, eventId), eq(waveEvents.waveId, waveId)))
      .returning();

    // 重新统计 wave 状态
    const allEvents = await db
      .select()
      .from(waveEvents)
      .where(eq(waveEvents.waveId, waveId));

    const completed = allEvents.filter((e) => e.status === "completed").length;
    const failed = allEvents.filter((e) => e.status === "failed").length;
    const total = allEvents.length;
    const allDone = completed + failed === total;

    await db
      .update(waves)
      .set({
        completedCount: completed,
        failedCount: failed,
        status: allDone ? "completed" : "running",
        finishedAt: allDone ? new Date() : null,
      })
      .where(eq(waves.id, waveId));

    res.json(updated);
  });

  return router;
}
