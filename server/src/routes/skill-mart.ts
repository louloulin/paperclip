import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  skillMartSkills,
  skillMartReviews,
  skillMartDownloads,
  companies,
} from "@paperclipai/db";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { validate } from "../middleware/validate.js";
import { forbidden, notFound, badRequest } from "../errors.js";

const publishSkillSchema = z.object({
  skillKey: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  markdown: z.string().default(""),
  tags: z.array(z.string()).default([]),
  version: z.string().default("1.0.0"),
  sourceType: z.string().default("local_path"),
  sourceLocator: z.string().optional(),
  isPaid: z.boolean().default(false),
  price: z.number().min(0).default(0),
  priceCurrency: z.string().default("USD"),
});

const updateSkillSchema = publishSkillSchema.partial();

const createReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});

export function skillMartRoutes(db: Db) {
  const router = Router();

  // GET /skill-mart - List published skills (public)
  router.get("/skill-mart", async (req, res) => {
    const { q, tag, sort, limit = "50", offset = "0" } = req.query as Record<string, string>;
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    let results = await db
      .select()
      .from(skillMartSkills)
      .leftJoin(companies, eq(skillMartSkills.companyId, companies.id as any))
      .where(eq(skillMartSkills.status, "published"))
      .orderBy(desc(skillMartSkills.downloadCount))
      .limit(limitNum)
      .offset(offsetNum);

    // Map to include companyName
    const mapped = results.map((r) => ({
      ...r.skill_mart_skills,
      companyName: (r.companies as any)?.name ?? null,
    } as Record<string, unknown>));

    // Apply filters
    if (q) {
      const queryLower = q.toLowerCase();
      mapped.filter(
        (s) =>
          String(s.name).toLowerCase().includes(queryLower) ||
          String(s.description ?? "").toLowerCase().includes(queryLower) ||
          String(s.skillKey).toLowerCase().includes(queryLower),
      );
    }
    if (tag) {
      mapped.filter((s) => (s.tags as string[] | null)?.includes(tag));
    }
    if (sort === "rating") {
      mapped.sort((a, b) => Number(b.ratingAvg) - Number(a.ratingAvg));
    } else if (sort === "newest") {
      mapped.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
    }

    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(skillMartSkills)
      .where(eq(skillMartSkills.status, "published"));
    const total = totalResult[0]?.count ?? 0;

    res.json({ skills: mapped, total, limit: limitNum, offset: offsetNum });
  });

  // GET /skill-mart/tags - Get all available tags
  router.get("/skill-mart/tags", async (req, res) => {
    const skills = await db
      .select({ tags: skillMartSkills.tags })
      .from(skillMartSkills)
      .where(eq(skillMartSkills.status, "published"));

    const tagCounts: Record<string, number> = {};
    for (const skill of skills) {
      for (const tag of (skill.tags as string[] | null) ?? []) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    }

    const tags = Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    res.json(tags);
  });

  // POST /skill-mart/publish - Public publish endpoint (uses default company for local-trusted mode)
  router.post("/skill-mart/publish", validate(publishSkillSchema), async (req, res) => {
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";
    const companyId = defaultCompanyId;
    const data = req.body;

    const slug = data.slug
      ? data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
      : data.skillKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

    const inserted = await db
      .insert(skillMartSkills)
      .values({
        companyId,
        skillKey: data.skillKey,
        slug,
        name: data.name,
        description: data.description ?? null,
        markdown: data.markdown ?? "",
        tags: data.tags ?? [],
        version: data.version ?? "1.0.0",
        sourceType: data.sourceType ?? "local_path",
        sourceLocator: data.sourceLocator ?? null,
        isPaid: data.isPaid ?? false,
        price: String(data.price ?? 0),
        priceCurrency: data.priceCurrency ?? "USD",
        status: "published",
        reviewStatus: "approved",
      } as any)
      .returning();

    res.status(201).json(inserted[0]);
  });

  // GET /skill-mart/my - Get skills published by current/default company
  router.get("/skill-mart/my", async (req, res) => {
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";

    const skills = await db
      .select()
      .from(skillMartSkills)
      .where(eq(skillMartSkills.companyId, defaultCompanyId as any))
      .orderBy(desc(skillMartSkills.createdAt));

    res.json(skills);
  });

  // PATCH /skill-mart/:id - Update a skill (public, default company ownership)
  router.patch("/skill-mart/:id", validate(updateSkillSchema), async (req, res) => {
    const skillId = req.params.id as string;
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";

    const existing = await db
      .select()
      .from(skillMartSkills)
      .where(eq(skillMartSkills.id, skillId as any))
      .limit(1);

    if (!existing.length) throw notFound("Skill not found");
    if ((existing[0] as any).companyId !== defaultCompanyId) throw forbidden("Not the owner of this skill");

    const data = req.body;
    const slug = data.slug
      ? data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
      : (existing[0] as any).slug;

    const updated = await db
      .update(skillMartSkills)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.markdown !== undefined && { markdown: data.markdown }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.version !== undefined && { version: data.version }),
        ...(data.sourceType !== undefined && { sourceType: data.sourceType }),
        ...(data.sourceLocator !== undefined && { sourceLocator: data.sourceLocator }),
        ...(data.isPaid !== undefined && { isPaid: data.isPaid }),
        ...(data.price !== undefined && { price: String(data.price) }),
        ...(data.priceCurrency !== undefined && { priceCurrency: data.priceCurrency }),
        slug,
        updatedAt: new Date(),
      } as any)
      .where(eq(skillMartSkills.id, skillId as any))
      .returning();

    res.json(updated[0]);
  });

  // DELETE /skill-mart/:id - Archive a skill (public, default company ownership)
  router.delete("/skill-mart/:id", async (req, res) => {
    const skillId = req.params.id as string;
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";

    const existing = await db
      .select()
      .from(skillMartSkills)
      .where(eq(skillMartSkills.id, skillId as any))
      .limit(1);

    if (!existing.length) throw notFound("Skill not found");
    if ((existing[0] as any).companyId !== defaultCompanyId) throw forbidden("Not the owner of this skill");

    await db
      .update(skillMartSkills)
      .set({ status: "archived", updatedAt: new Date() } as any)
      .where(eq(skillMartSkills.id, skillId as any));

    res.json({ success: true });
  });

  // GET /skill-mart/:id - Get skill detail (public)
  router.get("/skill-mart/:id", async (req, res) => {
    const { id } = req.params;
    const rows = await db
      .select()
      .from(skillMartSkills)
      .leftJoin(companies, eq(skillMartSkills.companyId, companies.id as any))
      .where(eq(skillMartSkills.id, id as any))
      .limit(1);

    if (!rows.length) throw notFound("Skill not found");
    const skill = rows[0];
    res.json({
      ...skill.skill_mart_skills,
      companyName: (skill.companies as any)?.name ?? null,
    });
  });

  // GET /companies/:companyId/skill-mart - List skills for a company
  router.get("/companies/:companyId/skill-mart", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const skills = await db
      .select()
      .from(skillMartSkills)
      .where(eq(skillMartSkills.companyId, companyId as any))
      .orderBy(desc(skillMartSkills.createdAt));

    res.json(skills);
  });

  // POST /companies/:companyId/skill-mart/publish - Publish a skill
  router.post("/companies/:companyId/skill-mart/publish", validate(publishSkillSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const data = req.body;

    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

    const inserted = await db
      .insert(skillMartSkills)
      .values({
        companyId,
        skillKey: data.skillKey,
        slug,
        name: data.name,
        description: data.description ?? null,
        markdown: data.markdown ?? "",
        tags: data.tags ?? [],
        version: data.version ?? "1.0.0",
        sourceType: data.sourceType ?? "local_path",
        sourceLocator: data.sourceLocator ?? null,
        isPaid: data.isPaid ?? false,
        price: String(data.price ?? 0),
        priceCurrency: data.priceCurrency ?? "USD",
        status: "published",
        reviewStatus: "approved",
      } as any)
      .returning();

    res.status(201).json(inserted[0]);
  });

  // PATCH /companies/:companyId/skill-mart/:skillId - Update a skill
  router.patch("/companies/:companyId/skill-mart/:skillId", validate(updateSkillSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const skillId = req.params.skillId as string;
    assertCompanyAccess(req, companyId);
    const data = req.body;

    const existing = await db
      .select()
      .from(skillMartSkills)
      .where(eq(skillMartSkills.id, skillId as any))
      .limit(1);

    if (!existing.length) throw notFound("Skill not found");
    if ((existing[0] as any).companyId !== companyId) throw forbidden("Not the owner of this skill");

    const slug = data.slug
      ? data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
      : (existing[0] as any).slug;

    const updated = await db
      .update(skillMartSkills)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.markdown !== undefined && { markdown: data.markdown }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.version !== undefined && { version: data.version }),
        ...(data.sourceType !== undefined && { sourceType: data.sourceType }),
        ...(data.sourceLocator !== undefined && { sourceLocator: data.sourceLocator }),
        ...(data.isPaid !== undefined && { isPaid: data.isPaid }),
        ...(data.price !== undefined && { price: String(data.price) }),
        ...(data.priceCurrency !== undefined && { priceCurrency: data.priceCurrency }),
        slug,
        updatedAt: new Date(),
      } as any)
      .where(eq(skillMartSkills.id, skillId as any))
      .returning();

    res.json(updated[0]);
  });

  // DELETE /companies/:companyId/skill-mart/:skillId - Archive a skill
  router.delete("/companies/:companyId/skill-mart/:skillId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const skillId = req.params.skillId as string;
    assertCompanyAccess(req, companyId);

    const existing = await db
      .select()
      .from(skillMartSkills)
      .where(eq(skillMartSkills.id, skillId as any))
      .limit(1);

    if (!existing.length) throw notFound("Skill not found");
    if ((existing[0] as any).companyId !== companyId) throw forbidden("Not the owner of this skill");

    await db
      .update(skillMartSkills)
      .set({ status: "archived", updatedAt: new Date() } as any)
      .where(eq(skillMartSkills.id, skillId as any));

    res.json({ success: true });
  });

  // GET /skill-mart/:id/reviews - Get reviews (public)
  router.get("/skill-mart/:id/reviews", async (req, res) => {
    const { id } = req.params;
    const { limit = "50", offset = "0" } = req.query as Record<string, string>;

    const reviews = await db
      .select()
      .from(skillMartReviews)
      .leftJoin(companies, eq(skillMartReviews.companyId, companies.id as any))
      .where(and(
        eq(skillMartReviews.skillId, id as any),
        eq(skillMartReviews.status, "approved"),
      ))
      .orderBy(desc(skillMartReviews.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const mapped = reviews.map((r) => ({
      ...r.skill_mart_reviews,
      companyName: (r.companies as any)?.name ?? null,
    }));

    res.json(mapped);
  });

  // POST /skill-mart/:id/reviews - Submit a review
  router.post("/skill-mart/:id/reviews", validate(createReviewSchema), async (req, res) => {
    const companyId = req.params.companyId ?? assertBoard(req);
    // For local-trusted mode without companyId, use a default
    const effectiveCompanyId = (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";
    const { id: skillId } = req.params;
    const { rating, comment } = req.body;

    const skill = await db
      .select()
      .from(skillMartSkills)
      .where(eq(skillMartSkills.id, skillId as any))
      .limit(1);

    if (!skill.length) throw notFound("Skill not found");

    // Check if company already reviewed
    const existing = await db
      .select()
      .from(skillMartReviews)
      .where(and(
        eq(skillMartReviews.skillId, skillId as any),
        eq(skillMartReviews.companyId, effectiveCompanyId as any),
      ))
      .limit(1);

    if (existing.length) {
      const updated = await db
        .update(skillMartReviews)
        .set({ rating, comment: comment ?? null, updatedAt: new Date() } as any)
        .where(eq(skillMartReviews.id, (existing[0] as any).id))
        .returning();
      return res.json(updated[0]);
    }

    const created = await db
      .insert(skillMartReviews)
      .values({
        skillId,
        companyId: effectiveCompanyId,
        rating,
        comment: comment ?? null,
        status: "approved",
      } as any)
      .returning();

    res.status(201).json(created[0]);
  });

  // POST /skill-mart/:id/download - Record a download
  router.post("/skill-mart/:id/download", async (req, res) => {
    const effectiveCompanyId = (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";
    const { id: skillId } = req.params;

    const skill = await db
      .select()
      .from(skillMartSkills)
      .where(eq(skillMartSkills.id, skillId as any))
      .limit(1);

    if (!skill.length) throw notFound("Skill not found");
    if ((skill[0] as any).status !== "published") throw badRequest("Skill is not available");

    const record = await db
      .insert(skillMartDownloads)
      .values({
        skillId,
        companyId: effectiveCompanyId,
        version: (skill[0] as any).version,
      } as any)
      .returning();

    res.status(201).json({ success: true, downloadId: record[0].id });
  });

  return router;
}
