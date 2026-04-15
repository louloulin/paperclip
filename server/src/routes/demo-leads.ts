import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  demoLeads,
  demoRequests,
  demoCompanies,
  companies,
} from "@paperclipai/db";
import { assertBoard, assertInstanceAdmin } from "./authz.js";
import { validate } from "../middleware/validate.js";
import { forbidden, notFound, badRequest } from "../errors.js";

const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "demo_scheduled",
  "demo_in_progress",
  "negotiating",
  "won",
  "lost",
  "churned",
] as const;

const DEMO_REQUEST_STATUSES = [
  "requested",
  "scheduled",
  "in_progress",
  "completed",
  "no_show",
  "cancelled",
] as const;

const createLeadSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  companySize: z.enum(["startup", "small", "medium", "large", "enterprise"]).optional(),
  industry: z.string().optional(),
  website: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  source: z.enum(["manual", "website", "referral", "linkedin", "cold_outreach", "event", "partner"]).default("manual"),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  referralCode: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  notes: z.string().optional(),
});

const updateLeadSchema = createLeadSchema.partial().omit({ contactEmail: true });

const createDemoRequestSchema = z.object({
  demoType: z.enum(["standard", "enterprise", "technical", "poc"]).default("standard"),
  useCase: z.string().optional(),
  teamSize: z.string().optional(),
  preferredDuration: z.enum(["30min", "60min", "90min"]).optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  meetingUrl: z.string().url().optional(),
  status: z.enum(DEMO_REQUEST_STATUSES).default("requested"),
  outcome: z.enum(["interested", "very_interested", "needs_review", "not_interested"]).optional(),
  completionNotes: z.string().optional(),
  feedbackScore: z.number().int().min(1).max(5).optional(),
  nextSteps: z.string().optional(),
});

const createDemoCompanySchema = z.object({
  demoRequestId: z.string().uuid().optional(),
  companyId: z.string().uuid(),
  companyName: z.string().min(1),
  demoTemplate: z.enum(["default", "enterprise", "developer", "poc"]).default("default"),
  sampleDataEnabled: z.boolean().default(true),
  trialDays: z.number().int().positive().default(14),
});

export interface DemoLead {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  companySize: string | null;
  industry: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  source: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referralCode: string | null;
  status: string;
  priority: string;
  leadScore: number;
  hotLead: boolean;
  assignedToUserId: string | null;
  assignedAt: string | null;
  lastContactedAt: string | null;
  nextFollowupAt: string | null;
  followupCount: number;
  notes: string | null;
  lostReason: string | null;
  wonDetails: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemoRequest {
  id: string;
  leadId: string;
  companyId: string | null;
  demoType: string;
  useCase: string | null;
  teamSize: string | null;
  preferredDuration: string | null;
  scheduledAt: string | null;
  durationMinutes: number | null;
  meetingUrl: string | null;
  calendarEventId: string | null;
  status: string;
  outcome: string | null;
  completionNotes: string | null;
  feedbackScore: number | null;
  nextSteps: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DemoCompany {
  id: string;
  leadId: string;
  demoRequestId: string | null;
  companyId: string;
  companyName: string;
  isTrial: boolean;
  trialExpiresAt: string | null;
  demoTemplate: string;
  sampleDataEnabled: boolean;
  agentsCreated: number;
  tasksCompleted: number;
  apiCalls: number;
  activeDays: number;
  lastActiveAt: string | null;
  convertedToPaid: boolean;
  convertedAt: string | null;
  paidPlan: string | null;
  createdAt: string;
  expiresAt: string | null;
}

function formatLead(lead: Record<string, unknown>): DemoLead {
  return {
    id: lead.id as string,
    companyName: lead.companyName as string,
    contactName: lead.contactName as string | null,
    contactEmail: lead.contactEmail as string,
    contactPhone: lead.contactPhone as string | null,
    companySize: lead.companySize as string | null,
    industry: lead.industry as string | null,
    website: lead.website as string | null,
    country: lead.country as string | null,
    city: lead.city as string | null,
    source: lead.source as string,
    utmSource: lead.utmSource as string | null,
    utmMedium: lead.utmMedium as string | null,
    utmCampaign: lead.utmCampaign as string | null,
    referralCode: lead.referralCode as string | null,
    status: lead.status as string,
    priority: lead.priority as string,
    leadScore: lead.leadScore as number,
    hotLead: lead.hotLead as boolean,
    assignedToUserId: lead.assignedToUserId as string | null,
    assignedAt: lead.assignedAt ? String(lead.assignedAt) : null,
    lastContactedAt: lead.lastContactedAt ? String(lead.lastContactedAt) : null,
    nextFollowupAt: lead.nextFollowupAt ? String(lead.nextFollowupAt) : null,
    followupCount: lead.followupCount as number,
    notes: lead.notes as string | null,
    lostReason: lead.lostReason as string | null,
    wonDetails: lead.wonDetails as string | null,
    createdAt: String(lead.createdAt),
    updatedAt: String(lead.updatedAt),
  };
}

function formatDemoRequest(req: Record<string, unknown>): DemoRequest {
  return {
    id: req.id as string,
    leadId: req.leadId as string,
    companyId: req.companyId as string | null,
    demoType: req.demoType as string,
    useCase: req.useCase as string | null,
    teamSize: req.teamSize as string | null,
    preferredDuration: req.preferredDuration as string | null,
    scheduledAt: req.scheduledAt ? String(req.scheduledAt) : null,
    durationMinutes: req.durationMinutes as number | null,
    meetingUrl: req.meetingUrl as string | null,
    calendarEventId: req.calendarEventId as string | null,
    status: req.status as string,
    outcome: req.outcome as string | null,
    completionNotes: req.completionNotes as string | null,
    feedbackScore: req.feedbackScore as number | null,
    nextSteps: req.nextSteps as string | null,
    createdAt: String(req.createdAt),
    updatedAt: String(req.updatedAt),
    completedAt: req.completedAt ? String(req.completedAt) : null,
  };
}

function formatDemoCompany(dc: Record<string, unknown>): DemoCompany {
  return {
    id: dc.id as string,
    leadId: dc.leadId as string,
    demoRequestId: dc.demoRequestId as string | null,
    companyId: dc.companyId as string,
    companyName: dc.companyName as string,
    isTrial: dc.isTrial as boolean,
    trialExpiresAt: dc.trialExpiresAt ? String(dc.trialExpiresAt) : null,
    demoTemplate: dc.demoTemplate as string,
    sampleDataEnabled: dc.sampleDataEnabled as boolean,
    agentsCreated: dc.agentsCreated as number,
    tasksCompleted: dc.tasksCompleted as number,
    apiCalls: dc.apiCalls as number,
    activeDays: dc.activeDays as number,
    lastActiveAt: dc.lastActiveAt ? String(dc.lastActiveAt) : null,
    convertedToPaid: dc.convertedToPaid as boolean,
    convertedAt: dc.convertedAt ? String(dc.convertedAt) : null,
    paidPlan: dc.paidPlan as string | null,
    createdAt: String(dc.createdAt),
    expiresAt: dc.expiresAt ? String(dc.expiresAt) : null,
  };
}

export function demoLeadRoutes(_db: Db) {
  const router = Router();

  // GET /demo-leads - List leads (board only)
  router.get("/demo-leads", async (req, res) => {
    assertBoard(req);
    const db = _db;

    const { status, source, priority, hotLead, assignedToUserId, limit = "50", offset = "0" } = req.query as Record<string, string>;

    const conditions = [];
    if (status && LEAD_STATUSES.includes(status as typeof LEAD_STATUSES[number])) {
      conditions.push(eq(demoLeads.status, status));
    }
    if (source) {
      conditions.push(eq(demoLeads.source, source));
    }
    if (priority) {
      conditions.push(eq(demoLeads.priority, priority));
    }
    if (hotLead === "true") {
      conditions.push(eq(demoLeads.hotLead, true));
    }
    if (assignedToUserId) {
      conditions.push(eq(demoLeads.assignedToUserId, assignedToUserId));
    }

    const rows = await db.query.demoLeads.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(demoLeads.createdAt)],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    const total = await db.query.demoLeads.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      columns: { id: true },
    });

    res.json({
      leads: rows.map(formatLead),
      total: total.length,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  });

  // GET /demo-leads/pipeline - Pipeline stats (board only)
  router.get("/demo-leads/pipeline", async (req, res) => {
    assertBoard(req);
    const db = _db;

    const allLeads = await db.query.demoLeads.findMany();

    const pipelineMap: Record<string, number> = {};
    let hotLeads = 0;
    let wonLeads = 0;
    for (const lead of allLeads) {
      const status = (lead as unknown as Record<string, unknown>).status as string;
      pipelineMap[status] = (pipelineMap[status] ?? 0) + 1;
      if ((lead as unknown as Record<string, unknown>).hotLead) hotLeads++;
      if (status === "won") wonLeads++;
    }

    res.json({
      pipeline: Object.entries(pipelineMap).map(([status, count]) => ({ status, count })),
      total: allLeads.length,
      hotLeads,
      won: wonLeads,
    });
  });

  // GET /demo-leads/next-followups - Leads due for followup
  router.get("/demo-leads/next-followups", async (req, res) => {
    assertBoard(req);
    const db = _db;

    const now = new Date();
    const allLeads = await db.query.demoLeads.findMany({
      orderBy: [demoLeads.nextFollowupAt],
    });

    const overdue = allLeads
      .filter((l) => {
        const l2 = l as unknown as Record<string, unknown>;
        const nextUp = l2.nextFollowupAt as Date | null;
        const status = l2.status as string;
        return nextUp && nextUp <= now && !["won", "lost", "churned"].includes(status);
      })
      .slice(0, 20);

    res.json({ leads: overdue.map(formatLead) });
  });

  // GET /demo-leads/sources - Lead source breakdown
  router.get("/demo-leads/sources", async (req, res) => {
    assertBoard(req);
    const db = _db;

    const allLeads = await db.query.demoLeads.findMany();
    const sourceMap: Record<string, number> = {};
    for (const lead of allLeads) {
      const src = (lead as unknown as Record<string, unknown>).source as string;
      sourceMap[src] = (sourceMap[src] ?? 0) + 1;
    }

    res.json({
      sources: Object.entries(sourceMap)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
    });
  });

  // POST /demo-leads - Create a lead
  router.post("/demo-leads", validate(createLeadSchema), async (req, res) => {
    assertBoard(req);
    const db = _db;
    const body = req.body as z.infer<typeof createLeadSchema>;

    const [lead] = await db
      .insert(demoLeads)
      .values({
        companyName: body.companyName,
        contactName: body.contactName ?? null,
        contactEmail: body.contactEmail,
        contactPhone: body.contactPhone ?? null,
        companySize: body.companySize ?? null,
        industry: body.industry ?? null,
        website: body.website ?? null,
        country: body.country ?? null,
        city: body.city ?? null,
        source: body.source ?? "manual",
        utmSource: body.utmSource ?? null,
        utmMedium: body.utmMedium ?? null,
        utmCampaign: body.utmCampaign ?? null,
        referralCode: body.referralCode ?? null,
        priority: body.priority ?? "medium",
        notes: body.notes ?? null,
      })
      .returning();

    res.status(201).json(formatLead(lead as unknown as Record<string, unknown>));
  });

  // GET /demo-leads/:id - Get a lead
  router.get("/demo-leads/:id", async (req, res) => {
    assertBoard(req);
    const db = _db;
    const id = req.params.id as string;

    const lead = await db.query.demoLeads.findFirst({ where: eq(demoLeads.id, id) });
    if (!lead) throw notFound("Lead not found");

    res.json(formatLead(lead as unknown as Record<string, unknown>));
  });

  // PATCH /demo-leads/:id - Update a lead
  router.patch("/demo-leads/:id", validate(updateLeadSchema), async (req, res) => {
    assertBoard(req);
    const db = _db;
    const id = req.params.id as string;
    const body = req.body as z.infer<typeof updateLeadSchema>;

    const existing = await db.query.demoLeads.findFirst({ where: eq(demoLeads.id, id) });
    if (!existing) throw notFound("Lead not found");

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.companyName !== undefined) updates.companyName = body.companyName;
    if (body.contactName !== undefined) updates.contactName = body.contactName;
    if (body.contactPhone !== undefined) updates.contactPhone = body.contactPhone;
    if (body.companySize !== undefined) updates.companySize = body.companySize;
    if (body.industry !== undefined) updates.industry = body.industry;
    if (body.website !== undefined) updates.website = body.website;
    if (body.country !== undefined) updates.country = body.country;
    if (body.city !== undefined) updates.city = body.city;
    if (body.source !== undefined) updates.source = body.source;
    if (body.utmSource !== undefined) updates.utmSource = body.utmSource;
    if (body.utmMedium !== undefined) updates.utmMedium = body.utmMedium;
    if (body.utmCampaign !== undefined) updates.utmCampaign = body.utmCampaign;
    if (body.referralCode !== undefined) updates.referralCode = body.referralCode;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await db
      .update(demoLeads)
      .set(updates as Record<string, unknown>)
      .where(eq(demoLeads.id, id))
      .returning();

    res.json(formatLead(updated as unknown as Record<string, unknown>));
  });

  // PATCH /demo-leads/:id/status - Update lead status
  router.patch("/demo-leads/:id/status", async (req, res) => {
    assertBoard(req);
    const db = _db;
    const id = req.params.id as string;
    const { status, lostReason, wonDetails, nextFollowupAt } = req.body as {
      status?: string;
      lostReason?: string;
      wonDetails?: string;
      nextFollowupAt?: string;
    };

    if (status && !LEAD_STATUSES.includes(status as typeof LEAD_STATUSES[number])) {
      throw badRequest("Invalid status");
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status) {
      updates.status = status;
      if (status === "contacted") {
        updates.lastContactedAt = new Date();
        updates.followupCount = sql`followup_count + 1`;
      }
      if (status === "won" && wonDetails) {
        updates.wonDetails = wonDetails;
      }
      if (status === "lost" && lostReason) {
        updates.lostReason = lostReason;
      }
    }
    if (nextFollowupAt) {
      updates.nextFollowupAt = new Date(nextFollowupAt);
    }

    const [updated] = await db
      .update(demoLeads)
      .set(updates as Record<string, unknown>)
      .where(eq(demoLeads.id, id))
      .returning();

    res.json(formatLead(updated as unknown as Record<string, unknown>));
  });

  // DELETE /demo-leads/:id - Delete a lead
  router.delete("/demo-leads/:id", async (req, res) => {
    assertBoard(req);
    const db = _db;
    const id = req.params.id as string;

    const existing = await db.query.demoLeads.findFirst({ where: eq(demoLeads.id, id) });
    if (!existing) throw notFound("Lead not found");

    await db.delete(demoLeads).where(eq(demoLeads.id, id));
    res.status(204).send();
  });

  // POST /demo-leads/:id/requests - Create demo request for a lead
  router.post("/demo-leads/:id/requests", validate(createDemoRequestSchema), async (req, res) => {
    assertBoard(req);
    const db = _db;
    const leadId = req.params.id as string;
    const body = req.body as z.infer<typeof createDemoRequestSchema>;

    const lead = await db.query.demoLeads.findFirst({ where: eq(demoLeads.id, leadId) });
    if (!lead) throw notFound("Lead not found");

    const [demoReq] = await db
      .insert(demoRequests)
      .values({
        leadId,
        demoType: body.demoType ?? "standard",
        useCase: body.useCase ?? null,
        teamSize: body.teamSize ?? null,
        preferredDuration: body.preferredDuration ?? null,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        durationMinutes: body.durationMinutes ?? null,
        meetingUrl: body.meetingUrl ?? null,
        status: body.status ?? "requested",
        outcome: body.outcome ?? null,
        completionNotes: body.completionNotes ?? null,
        feedbackScore: body.feedbackScore ?? null,
        nextSteps: body.nextSteps ?? null,
        completedAt: body.status === "completed" ? new Date() : null,
      })
      .returning();

    // Update lead status to demo_scheduled if applicable
    if (body.status === "scheduled") {
      await db
        .update(demoLeads)
        .set({ status: "demo_scheduled", updatedAt: new Date() })
        .where(eq(demoLeads.id, leadId));
    }

    res.status(201).json(formatDemoRequest(demoReq as unknown as Record<string, unknown>));
  });

  // GET /demo-leads/:id/requests - Get demo requests for a lead
  router.get("/demo-leads/:id/requests", async (req, res) => {
    assertBoard(req);
    const db = _db;
    const leadId = req.params.id as string;

    const rows = await db.query.demoRequests.findMany({
      where: eq(demoRequests.leadId, leadId),
      orderBy: [desc(demoRequests.createdAt)],
    });

    res.json({ requests: rows.map(formatDemoRequest) });
  });

  // GET /demo-requests/:id - Get demo request
  router.get("/demo-requests/:id", async (req, res) => {
    assertBoard(req);
    const db = _db;
    const id = req.params.id as string;

    const req_ = await db.query.demoRequests.findFirst({ where: eq(demoRequests.id, id) });
    if (!req_) throw notFound("Demo request not found");

    res.json(formatDemoRequest(req_ as unknown as Record<string, unknown>));
  });

  // PATCH /demo-requests/:id - Update demo request
  router.patch("/demo-requests/:id", async (req, res) => {
    assertBoard(req);
    const db = _db;
    const id = req.params.id as string;
    const body = req.body as Partial<{
      scheduledAt: string;
      durationMinutes: number;
      meetingUrl: string;
      status: string;
      outcome: string;
      completionNotes: string;
      feedbackScore: number;
      nextSteps: string;
    }>;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.scheduledAt) updates.scheduledAt = new Date(body.scheduledAt);
    if (body.durationMinutes !== undefined) updates.durationMinutes = body.durationMinutes;
    if (body.meetingUrl !== undefined) updates.meetingUrl = body.meetingUrl;
    if (body.status) {
      updates.status = body.status;
      if (body.status === "completed") updates.completedAt = new Date();
    }
    if (body.outcome !== undefined) updates.outcome = body.outcome;
    if (body.completionNotes !== undefined) updates.completionNotes = body.completionNotes;
    if (body.feedbackScore !== undefined) updates.feedbackScore = body.feedbackScore;
    if (body.nextSteps !== undefined) updates.nextSteps = body.nextSteps;

    const [updated] = await db
      .update(demoRequests)
      .set(updates as Record<string, unknown>)
      .where(eq(demoRequests.id, id))
      .returning();

    res.json(formatDemoRequest(updated as unknown as Record<string, unknown>));
  });

  // POST /demo-leads/:id/demo-companies - Create demo company for a lead
  router.post("/demo-leads/:id/demo-companies", validate(createDemoCompanySchema), async (req, res) => {
    assertBoard(req);
    const db = _db;
    const leadId = req.params.id as string;
    const body = req.body as z.infer<typeof createDemoCompanySchema>;

    const lead = await db.query.demoLeads.findFirst({ where: eq(demoLeads.id, leadId) });
    if (!lead) throw notFound("Lead not found");

    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + body.trialDays);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + body.trialDays);

    const [demoCompany] = await db
      .insert(demoCompanies)
      .values({
        leadId,
        demoRequestId: body.demoRequestId ?? null,
        companyId: body.companyId,
        companyName: body.companyName,
        isTrial: true,
        trialExpiresAt,
        demoTemplate: body.demoTemplate,
        sampleDataEnabled: body.sampleDataEnabled,
        expiresAt,
      })
      .returning();

    // Update lead status to demo_in_progress
    await db
      .update(demoLeads)
      .set({ status: "demo_in_progress", updatedAt: new Date() })
      .where(eq(demoLeads.id, leadId));

    res.status(201).json(formatDemoCompany(demoCompany as unknown as Record<string, unknown>));
  });

  // GET /demo-leads/:id/demo-companies - Get demo companies for a lead
  router.get("/demo-leads/:id/demo-companies", async (req, res) => {
    assertBoard(req);
    const db = _db;
    const leadId = req.params.id as string;

    const rows = await db.query.demoCompanies.findMany({
      where: eq(demoCompanies.leadId, leadId),
      orderBy: [desc(demoCompanies.createdAt)],
    });

    res.json({ demoCompanies: rows.map(formatDemoCompany) });
  });

  // PATCH /demo-companies/:id - Update demo company usage stats
  router.patch("/demo-companies/:id", async (req, res) => {
    assertBoard(req);
    const db = _db;
    const id = req.params.id as string;
    const body = req.body as Partial<{
      agentsCreated: number;
      tasksCompleted: number;
      apiCalls: number;
      activeDays: number;
      convertedToPaid: boolean;
      paidPlan: string;
    }>;

    const updates: Record<string, unknown> = {};
    if (body.agentsCreated !== undefined) updates.agentsCreated = body.agentsCreated;
    if (body.tasksCompleted !== undefined) updates.tasksCompleted = body.tasksCompleted;
    if (body.apiCalls !== undefined) updates.apiCalls = body.apiCalls;
    if (body.activeDays !== undefined) updates.activeDays = body.activeDays;
    if (body.convertedToPaid !== undefined) {
      updates.convertedToPaid = body.convertedToPaid;
      if (body.convertedToPaid) {
        updates.convertedAt = new Date();
      }
    }
    if (body.paidPlan !== undefined) updates.paidPlan = body.paidPlan;
    updates.lastActiveAt = new Date();

    const [updated] = await db
      .update(demoCompanies)
      .set(updates as Record<string, unknown>)
      .where(eq(demoCompanies.id, id))
      .returning();

    res.json(formatDemoCompany(updated as unknown as Record<string, unknown>));
  });

  return router;
}
