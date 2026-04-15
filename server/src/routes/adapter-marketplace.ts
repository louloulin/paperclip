import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  adapterMarketplace,
  adapterMarketplaceReviews,
  adapterMarketplaceInstalls,
  companies,
} from "@paperclipai/db";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { validate } from "../middleware/validate.js";
import { forbidden, notFound, badRequest } from "../errors.js";

const publishAdapterSchema = z.object({
  adapterType: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  markdown: z.string().default(""),
  tags: z.array(z.string()).default([]),
  version: z.string().default("1.0.0"),
  sourceType: z.enum(["npm", "local_path", "github", "url"]).default("npm"),
  sourceLocator: z.string().optional(),
  authorName: z.string().optional(),
  authorUrl: z.string().optional(),
  homepageUrl: z.string().optional(),
  repositoryUrl: z.string().optional(),
  configSchema: z.any().optional(),
  compatibleAdapters: z.array(z.string()).default([]),
  isPaid: z.boolean().default(false),
  price: z.number().min(0).default(0),
  priceCurrency: z.string().default("USD"),
});

const updateAdapterSchema = publishAdapterSchema.partial();

const createReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});

export function adapterMarketplaceRoutes(db: Db) {
  const router = Router();

  // GET /adapter-marketplace - List published adapters (public)
  router.get("/adapter-marketplace", async (req, res) => {
    const { q, tag, sort, source_type, limit = "50", offset = "0" } = req.query as Record<string, string>;
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    let results = await db
      .select()
      .from(adapterMarketplace)
      .leftJoin(companies, eq(adapterMarketplace.companyId, companies.id as any))
      .where(eq(adapterMarketplace.status, "published"))
      .orderBy(desc(adapterMarketplace.installCount))
      .limit(limitNum)
      .offset(offsetNum);

    const mapped = results.map((r) => ({
      ...r.adapter_marketplace,
      companyName: (r.companies as any)?.name ?? null,
    } as Record<string, unknown>));

    // Apply filters in-memory for simplicity
    let filtered = mapped;
    if (q) {
      const queryLower = q.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          String(s.name).toLowerCase().includes(queryLower) ||
          String(s.description ?? "").toLowerCase().includes(queryLower) ||
          String(s.adapterType).toLowerCase().includes(queryLower),
      );
    }
    if (tag) {
      filtered = filtered.filter((s) => (s.tags as string[] | null)?.includes(tag as string));
    }
    if (source_type) {
      filtered = filtered.filter((s) => s.sourceType === source_type);
    }
    if (sort === "rating") {
      filtered.sort((a, b) => Number(b.ratingAvg) - Number(a.ratingAvg));
    } else if (sort === "newest") {
      filtered.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
    }

    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.status, "published"));
    const total = totalResult[0]?.count ?? 0;

    res.json({ adapters: filtered, total, limit: limitNum, offset: offsetNum });
  });

  // GET /adapter-marketplace/tags - Get all available tags
  router.get("/adapter-marketplace/tags", async (_req, res) => {
    const adapters = await db
      .select({ tags: adapterMarketplace.tags })
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.status, "published"));

    const tagCounts: Record<string, number> = {};
    for (const adapter of adapters) {
      for (const tag of (adapter.tags as string[] | null) ?? []) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    }

    const tags = Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    res.json(tags);
  });

  // GET /adapter-marketplace/categories - Get source type categories
  router.get("/adapter-marketplace/categories", async (_req, res) => {
    const result = await db
      .select({
        sourceType: adapterMarketplace.sourceType,
        count: sql<number>`count(*)::int`,
      })
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.status, "published"))
      .groupBy(adapterMarketplace.sourceType);

    res.json(result);
  });

  // GET /adapter-marketplace/stats - Marketplace statistics
  router.get("/adapter-marketplace/stats", async (_req, res) => {
    const [totalResult, installsResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(adapterMarketplace).where(eq(adapterMarketplace.status, "published")),
      db.select({ count: sql<number>`count(*)::int` }).from(adapterMarketplaceInstalls),
    ]);

    const topAdapters = await db
      .select({
        id: adapterMarketplace.id,
        name: adapterMarketplace.name,
        adapterType: adapterMarketplace.adapterType,
        installCount: adapterMarketplace.installCount,
        ratingAvg: adapterMarketplace.ratingAvg,
      })
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.status, "published"))
      .orderBy(desc(adapterMarketplace.installCount))
      .limit(5);

    res.json({
      totalAdapters: totalResult[0]?.count ?? 0,
      totalInstalls: installsResult[0]?.count ?? 0,
      topAdapters,
    });
  });

  // POST /adapter-marketplace/publish - Public publish endpoint
  router.post("/adapter-marketplace/publish", validate(publishAdapterSchema), async (req, res) => {
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";
    const data = req.body;

    const slug = data.slug
      ? data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
      : data.adapterType.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

    const inserted = await db
      .insert(adapterMarketplace)
      .values({
        companyId: defaultCompanyId,
        adapterType: data.adapterType,
        slug,
        name: data.name,
        description: data.description ?? null,
        markdown: data.markdown ?? "",
        tags: data.tags ?? [],
        version: data.version ?? "1.0.0",
        sourceType: data.sourceType ?? "npm",
        sourceLocator: data.sourceLocator ?? null,
        authorName: data.authorName ?? null,
        authorUrl: data.authorUrl ?? null,
        homepageUrl: data.homepageUrl ?? null,
        repositoryUrl: data.repositoryUrl ?? null,
        configSchema: data.configSchema ?? null,
        compatibleAdapters: data.compatibleAdapters ?? [],
        isPaid: data.isPaid ?? false,
        price: String(data.price ?? 0),
        priceCurrency: data.priceCurrency ?? "USD",
        status: "published",
        reviewStatus: "approved",
      } as any)
      .returning();

    res.status(201).json(inserted[0]);
  });

  // GET /adapter-marketplace/my - Get adapters published by current/default company
  router.get("/adapter-marketplace/my", async (_req, res) => {
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";

    const adapters = await db
      .select()
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.companyId, defaultCompanyId as any))
      .orderBy(desc(adapterMarketplace.createdAt));

    res.json(adapters);
  });

  // GET /adapter-marketplace/my/installs - Get my installed adapters
  router.get("/adapter-marketplace/my/installs", async (req, res) => {
    const effectiveCompanyId = (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";

    const installs = await db
      .select({
        install: adapterMarketplaceInstalls,
        adapter: adapterMarketplace,
      })
      .from(adapterMarketplaceInstalls)
      .innerJoin(adapterMarketplace, eq(adapterMarketplaceInstalls.adapterId, adapterMarketplace.id))
      .where(eq(adapterMarketplaceInstalls.companyId, effectiveCompanyId as any))
      .orderBy(desc(adapterMarketplaceInstalls.installedAt));

    res.json(installs.map((i) => ({
      ...i.adapter,
      installedAt: i.install.installedAt,
      installedVersion: i.install.version,
    })));
  });

  // PATCH /adapter-marketplace/:id - Update an adapter listing
  router.patch("/adapter-marketplace/:id", validate(updateAdapterSchema), async (req, res) => {
    const adapterId = req.params.id as string;
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";

    const existing = await db
      .select()
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.id, adapterId as any))
      .limit(1);

    if (!existing.length) throw notFound("Adapter not found");
    if ((existing[0] as any).companyId !== defaultCompanyId) throw forbidden("Not the owner of this adapter");

    const data = req.body;
    const slug = data.slug
      ? data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
      : (existing[0] as any).slug;

    const updated = await db
      .update(adapterMarketplace)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.markdown !== undefined && { markdown: data.markdown }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.version !== undefined && { version: data.version }),
        ...(data.sourceType !== undefined && { sourceType: data.sourceType }),
        ...(data.sourceLocator !== undefined && { sourceLocator: data.sourceLocator }),
        ...(data.authorName !== undefined && { authorName: data.authorName }),
        ...(data.authorUrl !== undefined && { authorUrl: data.authorUrl }),
        ...(data.homepageUrl !== undefined && { homepageUrl: data.homepageUrl }),
        ...(data.repositoryUrl !== undefined && { repositoryUrl: data.repositoryUrl }),
        ...(data.configSchema !== undefined && { configSchema: data.configSchema }),
        ...(data.compatibleAdapters !== undefined && { compatibleAdapters: data.compatibleAdapters }),
        ...(data.isPaid !== undefined && { isPaid: data.isPaid }),
        ...(data.price !== undefined && { price: String(data.price) }),
        ...(data.priceCurrency !== undefined && { priceCurrency: data.priceCurrency }),
        slug,
        updatedAt: new Date(),
      } as any)
      .where(eq(adapterMarketplace.id, adapterId as any))
      .returning();

    res.json(updated[0]);
  });

  // DELETE /adapter-marketplace/:id - Archive an adapter listing
  router.delete("/adapter-marketplace/:id", async (req, res) => {
    const adapterId = req.params.id as string;
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";

    const existing = await db
      .select()
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.id, adapterId as any))
      .limit(1);

    if (!existing.length) throw notFound("Adapter not found");
    if ((existing[0] as any).companyId !== defaultCompanyId) throw forbidden("Not the owner of this adapter");

    await db
      .update(adapterMarketplace)
      .set({ status: "archived", updatedAt: new Date() } as any)
      .where(eq(adapterMarketplace.id, adapterId as any));

    res.json({ success: true });
  });

  // GET /adapter-marketplace/:id - Get adapter detail (public)
  router.get("/adapter-marketplace/:id", async (req, res) => {
    const { id } = req.params;
    const rows = await db
      .select()
      .from(adapterMarketplace)
      .leftJoin(companies, eq(adapterMarketplace.companyId, companies.id as any))
      .where(eq(adapterMarketplace.id, id as any))
      .limit(1);

    if (!rows.length) throw notFound("Adapter not found");
    const adapter = rows[0];
    res.json({
      ...adapter.adapter_marketplace,
      companyName: (adapter.companies as any)?.name ?? null,
    });
  });

  // GET /adapter-marketplace/:id/reviews - Get reviews (public)
  router.get("/adapter-marketplace/:id/reviews", async (req, res) => {
    const { id } = req.params;
    const { limit = "50", offset = "0" } = req.query as Record<string, string>;

    const reviews = await db
      .select()
      .from(adapterMarketplaceReviews)
      .leftJoin(companies, eq(adapterMarketplaceReviews.companyId, companies.id as any))
      .where(and(
        eq(adapterMarketplaceReviews.adapterId, id as any),
        eq(adapterMarketplaceReviews.status, "approved"),
      ))
      .orderBy(desc(adapterMarketplaceReviews.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const mapped = reviews.map((r) => ({
      ...r.adapter_marketplace_reviews,
      companyName: (r.companies as any)?.name ?? null,
    }));

    res.json(mapped);
  });

  // POST /adapter-marketplace/:id/reviews - Submit a review
  router.post("/adapter-marketplace/:id/reviews", validate(createReviewSchema), async (req, res) => {
    assertBoard(req);
    const effectiveCompanyId = (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";
    const { id: adapterId } = req.params;
    const { rating, comment } = req.body;

    const adapter = await db
      .select()
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.id, adapterId as any))
      .limit(1);

    if (!adapter.length) throw notFound("Adapter not found");

    const existing = await db
      .select()
      .from(adapterMarketplaceReviews)
      .where(and(
        eq(adapterMarketplaceReviews.adapterId, adapterId as any),
        eq(adapterMarketplaceReviews.companyId, effectiveCompanyId as any),
      ))
      .limit(1);

    if (existing.length) {
      const updated = await db
        .update(adapterMarketplaceReviews)
        .set({ rating, comment: comment ?? null, updatedAt: new Date() } as any)
        .where(eq(adapterMarketplaceReviews.id, (existing[0] as any).id))
        .returning();
      return res.json(updated[0]);
    }

    const created = await db
      .insert(adapterMarketplaceReviews)
      .values({
        adapterId,
        companyId: effectiveCompanyId,
        rating,
        comment: comment ?? null,
        status: "approved",
      } as any)
      .returning();

    res.status(201).json(created[0]);
  });

  // POST /adapter-marketplace/:id/install - Install an adapter
  router.post("/adapter-marketplace/:id/install", async (req, res) => {
    assertBoard(req);
    const effectiveCompanyId = (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";
    const { id: adapterId } = req.params;

    const adapter = await db
      .select()
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.id, adapterId as any))
      .limit(1);

    if (!adapter.length) throw notFound("Adapter not found");
    if ((adapter[0] as any).status !== "published") throw badRequest("Adapter is not available");

    const record = await db
      .insert(adapterMarketplaceInstalls)
      .values({
        adapterId,
        companyId: effectiveCompanyId,
        version: (adapter[0] as any).version,
      } as any)
      .returning();

    res.status(201).json({ success: true, installId: record[0].id });
  });

  // Company-scoped routes

  // GET /companies/:companyId/adapter-marketplace - List adapters for a company
  router.get("/companies/:companyId/adapter-marketplace", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const adapters = await db
      .select()
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.companyId, companyId as any))
      .orderBy(desc(adapterMarketplace.createdAt));

    res.json(adapters);
  });

  // POST /companies/:companyId/adapter-marketplace/publish - Publish an adapter
  router.post("/companies/:companyId/adapter-marketplace/publish", validate(publishAdapterSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const data = req.body;

    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

    const inserted = await db
      .insert(adapterMarketplace)
      .values({
        companyId,
        adapterType: data.adapterType,
        slug,
        name: data.name,
        description: data.description ?? null,
        markdown: data.markdown ?? "",
        tags: data.tags ?? [],
        version: data.version ?? "1.0.0",
        sourceType: data.sourceType ?? "npm",
        sourceLocator: data.sourceLocator ?? null,
        authorName: data.authorName ?? null,
        authorUrl: data.authorUrl ?? null,
        homepageUrl: data.homepageUrl ?? null,
        repositoryUrl: data.repositoryUrl ?? null,
        configSchema: data.configSchema ?? null,
        compatibleAdapters: data.compatibleAdapters ?? [],
        isPaid: data.isPaid ?? false,
        price: String(data.price ?? 0),
        priceCurrency: data.priceCurrency ?? "USD",
        status: "published",
        reviewStatus: "approved",
      } as any)
      .returning();

    res.status(201).json(inserted[0]);
  });

  // PATCH /companies/:companyId/adapter-marketplace/:adapterId - Update an adapter
  router.patch("/companies/:companyId/adapter-marketplace/:adapterId", validate(updateAdapterSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const adapterId = req.params.adapterId as string;
    assertCompanyAccess(req, companyId);
    const data = req.body;

    const existing = await db
      .select()
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.id, adapterId as any))
      .limit(1);

    if (!existing.length) throw notFound("Adapter not found");
    if ((existing[0] as any).companyId !== companyId) throw forbidden("Not the owner of this adapter");

    const slug = data.slug
      ? data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
      : (existing[0] as any).slug;

    const updated = await db
      .update(adapterMarketplace)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.markdown !== undefined && { markdown: data.markdown }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.version !== undefined && { version: data.version }),
        ...(data.sourceType !== undefined && { sourceType: data.sourceType }),
        ...(data.sourceLocator !== undefined && { sourceLocator: data.sourceLocator }),
        ...(data.authorName !== undefined && { authorName: data.authorName }),
        ...(data.homepageUrl !== undefined && { homepageUrl: data.homepageUrl }),
        ...(data.repositoryUrl !== undefined && { repositoryUrl: data.repositoryUrl }),
        ...(data.configSchema !== undefined && { configSchema: data.configSchema }),
        ...(data.compatibleAdapters !== undefined && { compatibleAdapters: data.compatibleAdapters }),
        ...(data.isPaid !== undefined && { isPaid: data.isPaid }),
        ...(data.price !== undefined && { price: String(data.price) }),
        ...(data.priceCurrency !== undefined && { priceCurrency: data.priceCurrency }),
        slug,
        updatedAt: new Date(),
      } as any)
      .where(eq(adapterMarketplace.id, adapterId as any))
      .returning();

    res.json(updated[0]);
  });

  // DELETE /companies/:companyId/adapter-marketplace/:adapterId - Archive an adapter
  router.delete("/companies/:companyId/adapter-marketplace/:adapterId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const adapterId = req.params.adapterId as string;
    assertCompanyAccess(req, companyId);

    const existing = await db
      .select()
      .from(adapterMarketplace)
      .where(eq(adapterMarketplace.id, adapterId as any))
      .limit(1);

    if (!existing.length) throw notFound("Adapter not found");
    if ((existing[0] as any).companyId !== companyId) throw forbidden("Not the owner of this adapter");

    await db
      .update(adapterMarketplace)
      .set({ status: "archived", updatedAt: new Date() } as any)
      .where(eq(adapterMarketplace.id, adapterId as any));

    res.json({ success: true });
  });

  return router;
}
