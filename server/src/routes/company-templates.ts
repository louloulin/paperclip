import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, sql, count } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { forbidden, notFound, badRequest } from "../errors.js";

// Builtin template definitions
const BUILTIN_TEMPLATES = [
  {
    slug: "ai-software-dev",
    name: "AI 软件开发公司",
    description: "完整的AI驱动软件开发团队，包含CEO、CTO、前端/后端工程师和QA",
    category: "development",
    industry: "technology",
    icon: "💻",
    version: "1.0.0",
    isOfficial: true,
    config: {
      agents: [
        { name: "CEO", role: "ceo", skills: ["strategy", "management"] },
        { name: "CTO", role: "cto", skills: ["architecture", "code-review"], reportsTo: "CEO" },
        { name: "Frontend Engineer", role: "engineer", skills: ["react", "typescript", "css"], reportsTo: "CTO" },
        { name: "Backend Engineer", role: "engineer", skills: ["node", "python", "database"], reportsTo: "CTO" },
        { name: "QA Engineer", role: "qa", skills: ["testing", "automation"], reportsTo: "CTO" },
      ],
      departments: [
        { name: "Engineering", description: "产品研发部门", members: ["CTO", "Frontend Engineer", "Backend Engineer", "QA Engineer"] },
      ],
      skills: [
        { key: "code-review", name: "Code Review", source: "built-in" },
        { key: "testing", name: "Test Generation", source: "built-in" },
      ],
    },
    tags: ["software", "development", "engineering", "ai"],
  },
  {
    slug: "ai-content-studio",
    name: "AI 内容工作室",
    description: "AI内容创作团队，包含内容总监、文案、编辑和SEO专家",
    category: "content",
    industry: "media",
    icon: "✍️",
    version: "1.0.0",
    isOfficial: true,
    config: {
      agents: [
        { name: "Content Director", role: "director", skills: ["strategy", "editorial"] },
        { name: "Copywriter", role: "writer", skills: ["copywriting", "storytelling"], reportsTo: "Content Director" },
        { name: "Editor", role: "editor", skills: ["editing", "proofreading"], reportsTo: "Content Director" },
        { name: "SEO Specialist", role: "seo", skills: ["seo", "analytics"], reportsTo: "Content Director" },
      ],
      departments: [
        { name: "Content", description: "内容创作部门", members: ["Content Director", "Copywriter", "Editor", "SEO Specialist"] },
      ],
      skills: [
        { key: "copywriting", name: "AI Copywriting", source: "built-in" },
        { key: "seo-optimization", name: "SEO Optimization", source: "built-in" },
      ],
    },
    tags: ["content", "writing", "marketing", "media"],
  },
  {
    slug: "ai-ecommerce",
    name: "AI 电商运营公司",
    description: "电商运营团队，包含运营总监、选品、推广和客服",
    category: "ecommerce",
    industry: "retail",
    icon: "🛒",
    version: "1.0.0",
    isOfficial: true,
    config: {
      agents: [
        { name: "Operations Director", role: "director", skills: ["strategy", "operations"] },
        { name: "Product Manager", role: "product", skills: ["sourcing", "pricing"], reportsTo: "Operations Director" },
        { name: "Marketing Specialist", role: "marketing", skills: ["advertising", "social-media"], reportsTo: "Operations Director" },
        { name: "Customer Service", role: "support", skills: ["customer-service", "returns"], reportsTo: "Operations Director" },
      ],
      departments: [
        { name: "Operations", description: "电商运营部", members: ["Operations Director", "Product Manager", "Marketing Specialist"] },
        { name: "Customer Service", description: "客户服务部", members: ["Customer Service"] },
      ],
      skills: [
        { key: "product-sourcing", name: "Product Sourcing", source: "built-in" },
        { key: "ad-optimization", name: "Ad Optimization", source: "built-in" },
      ],
    },
    tags: ["ecommerce", "retail", "operations", "marketing"],
  },
  {
    slug: "ai-legal",
    name: "AI 法律顾问公司",
    description: "法律AI团队，包含合伙人、合同审查、合规检查和法律研究",
    category: "legal",
    industry: "legal",
    icon: "⚖️",
    version: "1.0.0",
    isOfficial: true,
    config: {
      agents: [
        { name: "Managing Partner", role: "partner", skills: ["legal-strategy", "client-management"] },
        { name: "Contract Reviewer", role: "associate", skills: ["contract-review", "risk-assessment"], reportsTo: "Managing Partner" },
        { name: "Compliance Officer", role: "compliance", skills: ["compliance", "regulation"], reportsTo: "Managing Partner" },
        { name: "Legal Researcher", role: "researcher", skills: ["legal-research", "case-law"], reportsTo: "Managing Partner" },
      ],
      departments: [
        { name: "Legal", description: "法律事务部", members: ["Managing Partner", "Contract Reviewer", "Compliance Officer", "Legal Researcher"] },
      ],
      skills: [
        { key: "contract-review", name: "Contract Review", source: "built-in" },
        { key: "compliance-check", name: "Compliance Check", source: "built-in" },
      ],
    },
    tags: ["legal", "compliance", "contract", "law"],
  },
  {
    slug: "ai-finance",
    name: "AI 金融分析公司",
    description: "金融分析团队，包含CFO、投资分析师、风控和会计",
    category: "finance",
    industry: "finance",
    icon: "📊",
    version: "1.0.0",
    isOfficial: true,
    config: {
      agents: [
        { name: "CFO", role: "cfo", skills: ["financial-strategy", "budgeting"] },
        { name: "Investment Analyst", role: "analyst", skills: ["market-analysis", "valuation"], reportsTo: "CFO" },
        { name: "Risk Manager", role: "risk", skills: ["risk-assessment", "hedging"], reportsTo: "CFO" },
        { name: "Accountant", role: "accountant", skills: ["bookkeeping", "reporting"], reportsTo: "CFO" },
      ],
      departments: [
        { name: "Finance", description: "金融分析部", members: ["CFO", "Investment Analyst", "Risk Manager", "Accountant"] },
      ],
      skills: [
        { key: "financial-analysis", name: "Financial Analysis", source: "built-in" },
        { key: "risk-management", name: "Risk Management", source: "built-in" },
      ],
    },
    tags: ["finance", "investment", "risk", "accounting"],
  },
  {
    slug: "ai-medical",
    name: "AI 医疗健康公司",
    description: "医疗AI团队，包含医疗总监、诊断分析、药物研究和患者管理",
    category: "medical",
    industry: "healthcare",
    icon: "🏥",
    version: "1.0.0",
    isOfficial: true,
    config: {
      agents: [
        { name: "Medical Director", role: "director", skills: ["clinical-strategy", "regulatory"] },
        { name: "Diagnostic Analyst", role: "analyst", skills: ["diagnostics", "imaging"], reportsTo: "Medical Director" },
        { name: "Research Specialist", role: "researcher", skills: ["drug-research", "clinical-trials"], reportsTo: "Medical Director" },
        { name: "Patient Manager", role: "coordinator", skills: ["patient-care", "scheduling"], reportsTo: "Medical Director" },
      ],
      departments: [
        { name: "Clinical", description: "临床诊断部", members: ["Medical Director", "Diagnostic Analyst"] },
        { name: "Research", description: "医学研究部", members: ["Research Specialist"] },
      ],
      skills: [
        { key: "medical-diagnosis", name: "Medical Diagnosis", source: "built-in" },
        { key: "drug-interaction", name: "Drug Interaction Check", source: "built-in" },
      ],
    },
    tags: ["medical", "healthcare", "diagnostics", "research"],
  },
];

const publishTemplateSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().default("general"),
  industry: z.string().default("technology"),
  icon: z.string().optional(),
  version: z.string().default("1.0.0"),
  config: z.object({}).passthrough().default({}),
  tags: z.array(z.string()).default([]),
  isPaid: z.boolean().default(false),
  price: z.number().min(0).default(0),
  priceCurrency: z.string().default("USD"),
});

const updateTemplateSchema = publishTemplateSchema.partial();

const createReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});

export function companyTemplateRoutes(db: Db) {
  const router = Router();

  // GET /company-templates - List templates (with builtins merged)
  router.get("/company-templates", async (_req, res) => {
    const { q, category, industry, sort, limit = "50", offset = "0" } = _req.query as Record<string, string>;
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    // Get user-created templates from DB
    let dbTemplates: any[] = [];
    try {
      const { companyTemplates } = await import("@paperclipai/db");
      dbTemplates = await db
        .select()
        .from(companyTemplates)
        .leftJoin(companies, eq(companyTemplates.publisherId, companies.id as any))
        .where(eq(companyTemplates.status, "published"))
        .orderBy(desc(companyTemplates.downloadCount))
        .limit(limitNum)
        .offset(offsetNum);
    } catch {
      // DB table may not exist yet, continue with builtins only
    }

    const dbMapped = dbTemplates.map((r: any) => ({
      ...r.company_templates,
      publisherName: (r.companies as any)?.name ?? null,
      source: "community" as const,
    }));

    // Merge with builtin templates
    const allTemplates = [
      ...BUILTIN_TEMPLATES.map((t) => ({
        id: `builtin-${t.slug}`,
        publisherId: "official",
        publisherName: "AgentCorp OS",
        slug: t.slug,
        name: t.name,
        description: t.description ?? null,
        category: t.category,
        industry: t.industry,
        icon: t.icon ?? null,
        version: t.version,
        config: t.config,
        tags: t.tags,
        isPaid: false,
        price: "0",
        priceCurrency: "USD",
        downloadCount: 0,
        ratingAvg: "5.00",
        ratingCount: 1,
        status: "published",
        isOfficial: true,
        source: "builtin" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      ...dbMapped,
    ];

    // Apply filters
    let filtered = allTemplates;
    if (q) {
      const ql = q.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(ql) ||
          (t.description ?? "").toLowerCase().includes(ql) ||
          t.tags.some((tag: string) => tag.toLowerCase().includes(ql)),
      );
    }
    if (category) {
      filtered = filtered.filter((t) => t.category === category);
    }
    if (industry) {
      filtered = filtered.filter((t) => t.industry === industry);
    }
    if (sort === "rating") {
      filtered.sort((a, b) => Number(b.ratingAvg) - Number(a.ratingAvg));
    } else if (sort === "newest") {
      filtered.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
    }

    res.json(filtered);
  });

  // GET /company-templates/categories - List available categories and industries
  router.get("/company-templates/categories", async (_req, res) => {
    const categories = [
      { id: "development", name: "软件开发", icon: "💻" },
      { id: "content", name: "内容创作", icon: "✍️" },
      { id: "ecommerce", name: "电商运营", icon: "🛒" },
      { id: "legal", name: "法律顾问", icon: "⚖️" },
      { id: "finance", name: "金融分析", icon: "📊" },
      { id: "medical", name: "医疗健康", icon: "🏥" },
      { id: "general", name: "通用", icon: "🏢" },
    ];
    const industries = [
      "technology",
      "media",
      "retail",
      "legal",
      "finance",
      "healthcare",
      "education",
      "manufacturing",
    ];
    res.json({ categories, industries });
  });

  // GET /company-templates/:id - Get template detail
  router.get("/company-templates/:id", async (req, res) => {
    const id = req.params.id as string;

    // Check builtin
    const builtin = BUILTIN_TEMPLATES.find((t) => `builtin-${t.slug}` === id);
    if (builtin) {
      return res.json({
        id: `builtin-${builtin.slug}`,
        publisherId: "official",
        publisherName: "AgentCorp OS",
        ...builtin,
        isPaid: false,
        price: "0",
        priceCurrency: "USD",
        downloadCount: 0,
        ratingAvg: "5.00",
        ratingCount: 1,
        status: "published",
        isOfficial: true,
        source: "builtin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Check DB
    const { companyTemplates } = await import("@paperclipai/db");
    const rows = await db
      .select()
      .from(companyTemplates)
      .leftJoin(companies, eq(companyTemplates.publisherId, companies.id as any))
      .where(eq(companyTemplates.id, id as any))
      .limit(1);

    if (!rows.length) throw notFound("Template not found");

    res.json({
      ...(rows[0] as any).company_templates,
      publisherName: ((rows[0] as any).companies)?.name ?? null,
      source: "community",
    });
  });

  // POST /company-templates/publish - Publish a template
  router.post("/company-templates/publish", validate(publishTemplateSchema), async (req, res) => {
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";
    const data = req.body;
    const { companyTemplates } = await import("@paperclipai/db");

    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

    const inserted = await db
      .insert(companyTemplates)
      .values({
        publisherId: defaultCompanyId,
        slug,
        name: data.name,
        description: data.description ?? null,
        category: data.category,
        industry: data.industry,
        icon: data.icon ?? null,
        version: data.version,
        config: data.config,
        tags: data.tags,
        isPaid: data.isPaid,
        price: data.isPaid ? String(data.price) : "0",
        priceCurrency: data.priceCurrency,
        status: "published",
      } as any)
      .returning();

    res.status(201).json(inserted[0]);
  });

  // POST /company-templates/:id/install - Install a template to company
  router.post("/company-templates/:id/install", async (req, res) => {
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";
    const id = req.params.id as string;
    const { configOverrides } = req.body as { configOverrides?: Record<string, unknown> };

    let templateConfig: Record<string, unknown> = {};
    let version = "1.0.0";
    let templateIdForRecord = id;

    const builtin = BUILTIN_TEMPLATES.find((t) => `builtin-${t.slug}` === id);
    if (builtin) {
      templateConfig = builtin.config;
      version = builtin.version;
      templateIdForRecord = `builtin-${builtin.slug}`;
    } else {
      const { companyTemplates, companyTemplateInstalls } = await import("@paperclipai/db");
      const rows = await db.select().from(companyTemplates).where(eq(companyTemplates.id, id as any)).limit(1);
      if (!rows.length) throw notFound("Template not found");
      const tpl = rows[0] as any;
      templateConfig = tpl.config ?? {};
      version = tpl.version;
      templateIdForRecord = id;

      // Increment download count
      await db
        .update(companyTemplates)
        .set({ downloadCount: sql`${companyTemplates.downloadCount} + 1` } as any)
        .where(eq(companyTemplates.id, id as any));
    }

    // Record install
    const { companyTemplateInstalls } = await import("@paperclipai/db");
    const record = await db
      .insert(companyTemplateInstalls)
      .values({
        templateId: templateIdForRecord as any,
        companyId: defaultCompanyId as any,
        version,
        configOverrides: configOverrides ?? {},
      } as any)
      .returning();

    res.status(201).json({
      installId: record[0].id,
      config: { ...templateConfig, ...(configOverrides ?? {}) },
      version,
    });
  });

  // GET /company-templates/:id/reviews - List reviews
  router.get("/company-templates/:id/reviews", async (req, res) => {
    const id = req.params.id as string;
    const { companyTemplateReviews } = await import("@paperclipai/db");
    const reviews = await db
      .select()
      .from(companyTemplateReviews)
      .where(eq(companyTemplateReviews.templateId, id as any))
      .orderBy(desc(companyTemplateReviews.createdAt));
    res.json(reviews);
  });

  // POST /company-templates/:id/reviews - Create review
  router.post("/company-templates/:id/reviews", validate(createReviewSchema), async (req, res) => {
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";
    const id = req.params.id as string;
    const { rating, comment } = req.body;
    const { companyTemplateReviews, companyTemplates } = await import("@paperclipai/db");

    const created = await db
      .insert(companyTemplateReviews)
      .values({
        templateId: id as any,
        companyId: defaultCompanyId as any,
        rating,
        comment: comment ?? null,
      } as any)
      .returning();

    // Update rating avg for DB templates
    if (!(id as string).startsWith("builtin-")) {
      const stats = await db
        .select({
          avg: sql<string>`COALESCE(AVG(${companyTemplateReviews.rating}), 0)`,
          cnt: count(),
        })
        .from(companyTemplateReviews)
        .where(eq(companyTemplateReviews.templateId, id as any));

      if (stats[0]) {
        await db
          .update(companyTemplates)
          .set({
            ratingAvg: Number(stats[0].avg).toFixed(2),
            ratingCount: stats[0].cnt,
          } as any)
          .where(eq(companyTemplates.id, id as any));
      }
    }

    res.status(201).json(created[0]);
  });

  // GET /company-templates/my/installs - Get company's installed templates
  router.get("/company-templates/my/installs", async (_req, res) => {
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";
    const { companyTemplateInstalls } = await import("@paperclipai/db");

    const installs = await db
      .select()
      .from(companyTemplateInstalls)
      .where(eq(companyTemplateInstalls.companyId, defaultCompanyId as any))
      .orderBy(desc(companyTemplateInstalls.installedAt));

    res.json(installs);
  });

  // PATCH /company-templates/:id - Update template
  router.patch("/company-templates/:id", validate(updateTemplateSchema), async (req, res) => {
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";
    const id = req.params.id as string;
    const data = req.body;
    const { companyTemplates } = await import("@paperclipai/db");

    const existing = await db.select().from(companyTemplates).where(eq(companyTemplates.id, id as any)).limit(1);
    if (!existing.length) throw notFound("Template not found");
    if ((existing[0] as any).publisherId !== defaultCompanyId) throw forbidden("Not the publisher");

    const updated = await db
      .update(companyTemplates)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.industry !== undefined && { industry: data.industry }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.config !== undefined && { config: data.config }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.version !== undefined && { version: data.version }),
        ...(data.isPaid !== undefined && { isPaid: data.isPaid }),
        ...(data.price !== undefined && { price: String(data.price) }),
        updatedAt: new Date(),
      } as any)
      .where(eq(companyTemplates.id, id as any))
      .returning();

    res.json(updated[0]);
  });

  // DELETE /company-templates/:id - Archive template
  router.delete("/company-templates/:id", async (req, res) => {
    const defaultCompanyId = "00000000-0000-0000-0000-000000000001";
    const id = req.params.id as string;
    const { companyTemplates } = await import("@paperclipai/db");

    const existing = await db.select().from(companyTemplates).where(eq(companyTemplates.id, id as any)).limit(1);
    if (!existing.length) throw notFound("Template not found");
    if ((existing[0] as any).publisherId !== defaultCompanyId) throw forbidden("Not the publisher");

    await db
      .update(companyTemplates)
      .set({ status: "archived", updatedAt: new Date() } as any)
      .where(eq(companyTemplates.id, id as any));

    res.json({ success: true });
  });

  return router;
}
