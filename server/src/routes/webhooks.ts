import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { webhooks, webhookDeliveries } from "@paperclipai/db";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { validate } from "../middleware/validate.js";

const PROVIDERS = ["generic", "slack", "feishu", "dingtalk", "wecom"] as const;

const createWebhookSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  secret: z.string().optional(),
  provider: z.enum(PROVIDERS).default("generic"),
  events: z.array(z.string()).min(1).default(["*"]),
  headers: z.record(z.string()).default({}),
  description: z.string().optional(),
  retryConfig: z.object({
    maxRetries: z.number().int().min(0).max(10).default(3),
    backoffMs: z.number().int().min(100).default(1000),
  }).default({ maxRetries: 3, backoffMs: 1000 }),
});

const updateWebhookSchema = createWebhookSchema.partial().omit({ provider: true }).extend({
  isActive: z.boolean().optional(),
});

const testWebhookSchema = z.object({
  eventType: z.string().optional().default("test"),
  payload: z.record(z.unknown()).optional().default({}),
});

// Provider-specific payload transformers
function transformPayload(provider: string, eventType: string, payload: Record<string, unknown>): { body: string; headers: Record<string, string> } {
  const baseHeaders: Record<string, string> = { "Content-Type": "application/json" };

  switch (provider) {
    case "slack": {
      const text = `*[Paperclip]* Event: \`${eventType}\`\n${JSON.stringify(payload, null, 2)}`;
      return { body: JSON.stringify({ text, mrkdwn: true }), headers: baseHeaders };
    }
    case "feishu": {
      const text = `**Paperclip Event: ${eventType}**\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
      return { body: JSON.stringify({ msg_type: "interactive", card: { elements: [{ tag: "markdown", content: text }] } }), headers: baseHeaders };
    }
    case "dingtalk": {
      const text = `## Paperclip Event: ${eventType}\n${JSON.stringify(payload, null, 2)}`;
      return { body: JSON.stringify({ msgtype: "markdown", markdown: { title: `Paperclip: ${eventType}`, text } }), headers: baseHeaders };
    }
    case "wecom": {
      const text = `**Paperclip Event: ${eventType}**\n${JSON.stringify(payload, null, 2)}`;
      return { body: JSON.stringify({ msgtype: "markdown", markdown: { content: text } }), headers: baseHeaders };
    }
    default: {
      return { body: JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() }), headers: baseHeaders };
    }
  }
}

export function webhookRoutes(db: Db) {
  const router = Router();

  /**
   * List webhooks for a company
   * GET /api/companies/:companyId/webhooks
   */
  router.get("/companies/:companyId/webhooks", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const activeOnly = req.query.active === "true";

    const conditions = [eq(webhooks.companyId, companyId)];
    if (activeOnly) conditions.push(eq(webhooks.isActive, true));

    const result = await db
      .select()
      .from(webhooks)
      .where(and(...conditions))
      .orderBy(desc(webhooks.createdAt));

    // Hide secrets in list response
    const sanitized = result.map((w) => ({ ...w, secret: w.secret ? "••••••••" : null }));
    res.json(sanitized);
  });

  /**
   * Create a webhook
   * POST /api/companies/:companyId/webhooks
   */
  router.post("/companies/:companyId/webhooks", validate(createWebhookSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { name, url, secret, provider, events, headers, description, retryConfig } = req.body;

    const [row] = await db
      .insert(webhooks)
      .values({
        companyId,
        name,
        url,
        secret: secret ?? null,
        provider,
        events,
        headers,
        description: description ?? null,
        retryConfig,
        createdBy: (req as any).actor?.userId ?? null,
      })
      .returning();

    res.status(201).json({ ...row, secret: secret ? "••••••••" : null });
  });

  /**
   * Get a single webhook
   * GET /api/webhooks/:webhookId
   */
  router.get("/webhooks/:webhookId", async (req, res) => {
    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, req.params.webhookId as string))
      .limit(1);

    if (!webhook) { res.status(404).json({ error: "Webhook not found" }); return; }
    assertCompanyAccess(req, webhook.companyId);
    res.json({ ...webhook, secret: webhook.secret ? "••••••••" : null });
  });

  /**
   * Update a webhook
   * PATCH /api/webhooks/:webhookId
   */
  router.patch("/webhooks/:webhookId", validate(updateWebhookSchema), async (req, res) => {
    const [existing] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, req.params.webhookId as string))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Webhook not found" }); return; }
    assertCompanyAccess(req, existing.companyId);

    const body = req.body;
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updateValues.name = body.name;
    if (body.url !== undefined) updateValues.url = body.url;
    if (body.secret !== undefined) updateValues.secret = body.secret || null;
    if (body.events !== undefined) updateValues.events = body.events;
    if (body.headers !== undefined) updateValues.headers = body.headers;
    if (body.description !== undefined) updateValues.description = body.description || null;
    if (body.retryConfig !== undefined) updateValues.retryConfig = body.retryConfig;
    if (body.isActive !== undefined) updateValues.isActive = body.isActive;

    const [updated] = await db
      .update(webhooks)
      .set(updateValues)
      .where(eq(webhooks.id, req.params.webhookId as string))
      .returning();

    res.json({ ...updated, secret: updated?.secret ? "••••••••" : null });
  });

  /**
   * Delete a webhook
   * DELETE /api/webhooks/:webhookId
   */
  router.delete("/webhooks/:webhookId", async (req, res) => {
    const [existing] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, req.params.webhookId as string))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Webhook not found" }); return; }
    assertCompanyAccess(req, existing.companyId);

    await db.delete(webhooks).where(eq(webhooks.id, req.params.webhookId as string));
    res.json({ success: true });
  });

  /**
   * Test a webhook (send test event)
   * POST /api/webhooks/:webhookId/test
   */
  router.post("/webhooks/:webhookId/test", validate(testWebhookSchema), async (req, res) => {
    const [wh] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, req.params.webhookId as string))
      .limit(1);

    if (!wh) { res.status(404).json({ error: "Webhook not found" }); return; }
    assertCompanyAccess(req, wh.companyId);

    const { eventType, payload } = req.body;
    const start = Date.now();

    try {
      const { body: reqBody, headers: reqHeaders } = transformPayload(wh.provider, eventType, payload);
      const customHeaders = (wh.headers ?? {}) as Record<string, string>;
      const allHeaders = { ...reqHeaders, ...customHeaders };

      const fetchRes = await fetch(wh.url, {
        method: "POST",
        headers: allHeaders,
        body: reqBody,
        signal: AbortSignal.timeout(10_000),
      });

      const duration = Date.now() - start;
      const responseBody = await fetchRes.text().catch(() => "");

      await db.insert(webhookDeliveries).values({
        webhookId: wh.id,
        eventType,
        payload,
        requestHeaders: allHeaders,
        responseStatus: fetchRes.status,
        responseBody: responseBody.slice(0, 2000),
        durationMs: duration,
        status: fetchRes.status < 400 ? "delivered" : "failed",
        deliveredAt: fetchRes.status < 400 ? new Date() : null,
      });

      await db.update(webhooks).set({ lastTriggeredAt: new Date() }).where(eq(webhooks.id, wh.id));

      res.json({
        success: fetchRes.status < 400,
        statusCode: fetchRes.status,
        responseBody: responseBody.slice(0, 500),
        durationMs: duration,
      });
    } catch (err: any) {
      const duration = Date.now() - start;

      await db.insert(webhookDeliveries).values({
        webhookId: wh.id,
        eventType,
        payload,
        responseStatus: 0,
        durationMs: duration,
        status: "failed",
        errorMessage: err.message?.slice(0, 500) ?? "Unknown error",
      });

      res.json({
        success: false,
        error: err.message,
        durationMs: duration,
      });
    }
  });

  /**
   * Get delivery log for a webhook
   * GET /api/webhooks/:webhookId/deliveries
   */
  router.get("/webhooks/:webhookId/deliveries", async (req, res) => {
    const [wh] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, req.params.webhookId as string))
      .limit(1);

    if (!wh) { res.status(404).json({ error: "Webhook not found" }); return; }
    assertCompanyAccess(req, wh.companyId);

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const deliveries = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, req.params.webhookId as string))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);

    res.json(deliveries);
  });

  /**
   * Get webhook stats for a company
   * GET /api/companies/:companyId/webhook-stats
   */
  router.get("/companies/:companyId/webhook-stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const webhookStats = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${webhooks.isActive})`,
      })
      .from(webhooks)
      .where(eq(webhooks.companyId, companyId));

    const deliveryStats = await db
      .select({
        totalDeliveries: sql<number>`count(*)`,
        delivered: sql<number>`count(*) filter (where ${webhookDeliveries.status} = 'delivered')`,
        failed: sql<number>`count(*) filter (where ${webhookDeliveries.status} = 'failed')`,
        last24h: sql<number>`count(*) filter (where ${webhookDeliveries.createdAt} > now() - interval '24 hours')`,
        avgDurationMs: sql<number>`avg(${webhookDeliveries.durationMs}) filter (where ${webhookDeliveries.status} = 'delivered')`,
      })
      .from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhookDeliveries.webhookId, webhooks.id))
      .where(eq(webhooks.companyId, companyId));

    res.json({
      webhooks: webhookStats[0] ?? { total: 0, active: 0 },
      deliveries: deliveryStats[0] ?? { totalDeliveries: 0, delivered: 0, failed: 0, last24h: 0, avgDurationMs: null },
    });
  });

  /**
   * Retry a failed delivery
   * POST /api/webhook-deliveries/:deliveryId/retry
   */
  router.post("/webhook-deliveries/:deliveryId/retry", async (req, res) => {
    const [delivery] = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, req.params.deliveryId as string))
      .limit(1);

    if (!delivery) { res.status(404).json({ error: "Delivery not found" }); return; }

    const [wh] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, delivery.webhookId))
      .limit(1);

    if (!wh) { res.status(404).json({ error: "Webhook not found" }); return; }
    assertCompanyAccess(req, wh.companyId);

    const retryConfig = (wh.retryConfig ?? { maxRetries: 3, backoffMs: 1000 }) as { maxRetries: number; backoffMs: number };
    if (delivery.attempt >= retryConfig.maxRetries) {
      res.status(400).json({ error: "Max retries exceeded" });
      return;
    }

    const start = Date.now();
    try {
      const { body: reqBody, headers: reqHeaders } = transformPayload(wh.provider, delivery.eventType, delivery.payload as Record<string, unknown>);
      const customHeaders = (wh.headers ?? {}) as Record<string, string>;
      const allHeaders = { ...reqHeaders, ...customHeaders };

      const fetchRes = await fetch(wh.url, {
        method: "POST",
        headers: allHeaders,
        body: reqBody,
        signal: AbortSignal.timeout(10_000),
      });

      const duration = Date.now() - start;
      const responseBody = await fetchRes.text().catch(() => "");

      await db
        .update(webhookDeliveries)
        .set({
          status: fetchRes.status < 400 ? "delivered" : "failed",
          responseStatus: fetchRes.status,
          responseBody: responseBody.slice(0, 2000),
          durationMs: duration,
          attempt: delivery.attempt + 1,
          deliveredAt: fetchRes.status < 400 ? new Date() : undefined,
        })
        .where(eq(webhookDeliveries.id, req.params.deliveryId as string));

      res.json({
        success: fetchRes.status < 400,
        statusCode: fetchRes.status,
        attempt: delivery.attempt + 1,
        durationMs: duration,
      });
    } catch (err: any) {
      await db
        .update(webhookDeliveries)
        .set({
          status: "failed",
          errorMessage: err.message?.slice(0, 500) ?? "Unknown error",
          attempt: delivery.attempt + 1,
        })
        .where(eq(webhookDeliveries.id, req.params.deliveryId as string));

      res.json({ success: false, error: err.message, attempt: delivery.attempt + 1 });
    }
  });

  return router;
}
