import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  developerProfiles,
  payoutRequests,
} from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { notFound, badRequest } from "../errors.js";

/** Tier thresholds and benefits */
const TIER_CONFIG = {
  bronze: { minEarnings: 0, bonusRate: 0, maxPayoutPerMonth: 500, icon: "🥉" },
  silver: { minEarnings: 1000, bonusRate: 0.02, maxPayoutPerMonth: 2000, icon: "🥈" },
  gold: { minEarnings: 5000, bonusRate: 0.05, maxPayoutPerMonth: 10000, icon: "🥇" },
  platinum: { minEarnings: 10000, bonusRate: 0.10, maxPayoutPerMonth: Infinity, icon: "💎" },
};

/** Platform fee rate (15%), developer gets 85% */
const PLATFORM_FEE_RATE = 0.15;
const DEVELOPER_SHARE_RATE = 1 - PLATFORM_FEE_RATE;

/** Generate a referral code */
function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "DEV-";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const createPayoutSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default("USD"),
  method: z.string().default("stripe"),
  notes: z.string().optional(),
});

const updateProfileSchema = z.object({
  payoutMethod: z.string().optional(),
  payoutDetails: z.record(z.string()).optional(),
});

function getEffectiveCompanyId(req: any): string {
  return req.actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";
}

export function developerIncentiveRoutes(db: Db) {
  const router = Router();

  // ── GET /developer-incentive/profile — Get or create developer profile
  router.get("/developer-incentive/profile", async (req, res) => {
    try {
      const companyId = getEffectiveCompanyId(req);

      let [profile] = await db
        .select()
        .from(developerProfiles)
        .where(eq(developerProfiles.companyId, companyId as any))
        .limit(1);

      if (!profile) {
        // Auto-create profile
        const referralCode = generateReferralCode();
        [profile] = await db
          .insert(developerProfiles)
          .values({
            companyId,
            tier: "bronze",
            referralCode,
          } as any)
          .returning();
      }

      // Count skills
      const skillCount = await db.execute(sql`
        SELECT COUNT(*)::int as count FROM skill_mart_skills WHERE company_id = ${companyId}
      `);

      const tier = (profile as any)?.tier ?? "bronze";
      const tierInfo = TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
      const totalEarnings = Number((profile as any)?.totalEarnings ?? 0);

      res.json({
        ...profile,
        tierInfo: {
          current: tier,
          ...tierInfo,
          nextTier: getNextTier(tier),
          earningsToNextTier: getEarningsToNextTier(totalEarnings),
        },
        developerShareRate: DEVELOPER_SHARE_RATE,
      });
    } catch (err: any) {
      console.error("[developer-incentive] profile error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /developer-incentive/profile — Update developer profile
  router.patch("/developer-incentive/profile", validate(updateProfileSchema), async (req, res) => {
    const companyId = getEffectiveCompanyId(req);
    const { payoutMethod, payoutDetails } = req.body;

    const [profile] = await db
      .select()
      .from(developerProfiles)
      .where(eq(developerProfiles.companyId, companyId as any))
      .limit(1);

    if (!profile) throw notFound("Developer profile not found");

    const [updated] = await db
      .update(developerProfiles)
      .set({
        ...(payoutMethod && { payoutMethod }),
        ...(payoutDetails && { payoutDetails }),
        updatedAt: new Date(),
      } as any)
      .where(eq(developerProfiles.id, (profile as any).id))
      .returning();

    res.json(updated);
  });

  // ── GET /developer-incentive/earnings — Get earnings summary
  router.get("/developer-incentive/earnings", async (req, res) => {
    try {
      const companyId = getEffectiveCompanyId(req);
      const { period } = req.query as { period?: string };

      const now = new Date();
      const currentPeriod = period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      // Calculate from actual sales data
      const result = await db.execute(sql`
        SELECT
          COALESCE(SUM(CAST(sps.amount AS NUMERIC)), 0) as sales_revenue,
          COALESCE(SUM(CAST(sps.platform_fee AS NUMERIC)), 0) as platform_fees,
          COALESCE(SUM(CAST(sps.seller_amount AS NUMERIC)), 0) as net_earnings,
          COUNT(*)::int as sales_count
        FROM stripe_payment_sessions sps
        JOIN skill_mart_skills sms ON sps.skill_id = sms.id
        WHERE sms.company_id = ${companyId} AND sps.status = 'paid'
      `);

      const row = (result as any)[0] ?? {};
      const salesRevenue = Number(row.sales_revenue ?? 0);
      const platformFees = Number(row.platform_fees ?? 0);
      const netEarnings = Number(row.net_earnings ?? 0);
      const salesCount = Number(row.sales_count ?? 0);

      const [profile] = await db
        .select()
        .from(developerProfiles)
        .where(eq(developerProfiles.companyId, companyId as any))
        .limit(1);

      const tier = (profile as any)?.tier ?? "bronze";
      const tierConfig = TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
      const tierBonus = Math.round(netEarnings * tierConfig.bonusRate * 100) / 100;

      const payoutResult = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as total_payout
        FROM payout_requests WHERE company_id = ${companyId} AND status = 'completed'
      `);
      const totalPayout = Number(((payoutResult as any)[0] ?? {}).total_payout ?? 0);
      const availableBalance = netEarnings + tierBonus - totalPayout;

      res.json({
        period: currentPeriod,
        salesRevenue,
        platformFees,
        netEarnings,
        tierBonus,
        referralBonus: Number((profile as any)?.referralEarnings ?? 0),
        totalPayout,
        availableBalance: Math.max(0, availableBalance),
        salesCount,
        developerShareRate: DEVELOPER_SHARE_RATE,
        tier,
        tierBonusRate: tierConfig.bonusRate,
      });
    } catch (err: any) {
      console.error("[developer-incentive] earnings error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /developer-incentive/earnings/history — Monthly earnings history
  router.get("/developer-incentive/earnings/history", async (req, res) => {
    const companyId = getEffectiveCompanyId(req);
    const { months = "6" } = req.query as { months?: string };
    const numMonths = Math.min(parseInt(months) || 6, 24);

    // Generate period list for last N months
    const periods: string[] = [];
    const now = new Date();
    for (let i = 0; i < numMonths; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    // Get monthly breakdown from sessions using raw SQL
    const history = await db.execute(sql`
      SELECT
        TO_CHAR(sps.paid_at, 'YYYY-MM') as period,
        COALESCE(SUM(CAST(sps.seller_amount AS NUMERIC)), 0) as revenue,
        COUNT(*)::int as sales_count
      FROM stripe_payment_sessions sps
      JOIN skill_mart_skills sms ON sps.skill_id = sms.id
      WHERE sms.company_id = ${companyId}
        AND sps.status = 'paid'
        AND sps.paid_at IS NOT NULL
      GROUP BY TO_CHAR(sps.paid_at, 'YYYY-MM')
      ORDER BY period DESC
    `);

    // Fill in missing months with zeros
    const rows = history as any[];
    const historyMap = new Map((rows as any[]).map((h: any) => [h.period, h]));
    const filledHistory = periods.map((period) => ({
      period,
      revenue: Number(historyMap.get(period)?.revenue ?? 0),
      salesCount: Number(historyMap.get(period)?.sales_count ?? 0),
    }));

    res.json(filledHistory);
  });

  // ── POST /developer-incentive/payout-request — Request a payout
  router.post(
    "/developer-incentive/payout-request",
    validate(createPayoutSchema),
    async (req, res) => {
      const companyId = getEffectiveCompanyId(req);
      const { amount, currency, method, notes } = req.body;

      // Get available balance using raw SQL
      const earningsResult = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(sps.seller_amount AS NUMERIC)), 0) as net_earnings
        FROM stripe_payment_sessions sps
        JOIN skill_mart_skills sms ON sps.skill_id = sms.id
        WHERE sms.company_id = ${companyId} AND sps.status = 'paid'
      `);

      const payoutResult = await db.execute(sql`
        SELECT COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as total_payout
        FROM payout_requests
        WHERE company_id = ${companyId} AND status IN ('pending', 'processing', 'completed')
      `);

      const available = Number(((earningsResult as any)[0] ?? {}).net_earnings ?? 0)
        - Number(((payoutResult as any)[0] ?? {}).total_payout ?? 0);

      if (amount > available) {
        throw badRequest(`Insufficient balance. Available: $${available.toFixed(2)}, Requested: $${amount.toFixed(2)}`);
      }

      if (amount < 10) {
        throw badRequest("Minimum payout amount is $10.00");
      }

      const [payout] = await db
        .insert(payoutRequests)
        .values({
          companyId,
          amount: String(amount),
          currency,
          method,
          status: "pending",
          notes: notes ?? null,
        } as any)
        .returning();

      res.status(201).json(payout);
    },
  );

  // ── GET /developer-incentive/payout-requests — List payout requests
  router.get("/developer-incentive/payout-requests", async (req, res) => {
    const companyId = getEffectiveCompanyId(req);
    const { status } = req.query as { status?: string };

    const conditions = [eq(payoutRequests.companyId, companyId as any)];
    if (status) {
      conditions.push(eq(payoutRequests.status, status as any));
    }

    const requests = await db
      .select()
      .from(payoutRequests)
      .where(and(...conditions))
      .orderBy(desc(payoutRequests.createdAt));

    res.json(requests);
  });

  // ── PATCH /developer-incentive/payout-requests/:id/cancel — Cancel a pending payout
  router.patch("/developer-incentive/payout-requests/:id/cancel", async (req, res) => {
    const companyId = getEffectiveCompanyId(req);
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(payoutRequests)
      .where(
        and(
          eq(payoutRequests.id, id as any),
          eq(payoutRequests.companyId, companyId as any),
        ),
      )
      .limit(1);

    if (!existing) throw notFound("Payout request not found");
    if ((existing as any).status !== "pending") throw badRequest("Only pending requests can be cancelled");

    const [updated] = await db
      .update(payoutRequests)
      .set({ status: "cancelled", updatedAt: new Date() } as any)
      .where(eq(payoutRequests.id, id as any))
      .returning();

    res.json(updated);
  });

  // ── GET /developer-incentive/leaderboard — Developer leaderboard
  router.get("/developer-incentive/leaderboard", async (req, res) => {
    const { limit = "10" } = req.query as { limit?: string };
    const numLimit = Math.min(parseInt(limit) || 10, 50);

    const leaderboard = await db
      .select({
        companyId: developerProfiles.companyId,
        tier: developerProfiles.tier,
        totalEarnings: developerProfiles.totalEarnings,
        totalSales: developerProfiles.totalSales,
        totalSkills: developerProfiles.totalSkills,
      })
      .from(developerProfiles)
      .where(eq(developerProfiles.isActive, true as any))
      .orderBy(desc(developerProfiles.totalEarnings))
      .limit(numLimit);

    res.json(
      leaderboard.map((entry: any, index: number) => ({
        rank: index + 1,
        ...entry,
        tierInfo: TIER_CONFIG[entry.tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze,
      })),
    );
  });

  // ── GET /developer-incentive/tiers — Get tier information
  router.get("/developer-incentive/tiers", async (_req, res) => {
    res.json(
      Object.entries(TIER_CONFIG).map(([tier, config]) => ({
        tier,
        ...config,
        maxPayoutPerMonth: config.maxPayoutPerMonth === Infinity ? null : config.maxPayoutPerMonth,
      })),
    );
  });

  // ── GET /developer-incentive/stats — Global developer incentive stats
  router.get("/developer-incentive/stats", async (_req, res) => {
    const [devCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(developerProfiles)
      .where(eq(developerProfiles.isActive, true as any));

    const [totalPaidOut] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${payoutRequests.amount} AS NUMERIC)), 0)`,
      })
      .from(payoutRequests)
      .where(eq(payoutRequests.status, "completed" as any));

    const [totalEarnings] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${developerProfiles.totalEarnings} AS NUMERIC)), 0)`,
      })
      .from(developerProfiles);

    const tierDistribution = await db
      .select({
        tier: developerProfiles.tier,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(developerProfiles)
      .groupBy(developerProfiles.tier);

    const pendingPayouts = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${payoutRequests.amount} AS NUMERIC)), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(payoutRequests)
      .where(eq(payoutRequests.status, "pending" as any));

    res.json({
      totalDevelopers: devCount?.count ?? 0,
      totalEarnings: Number(totalEarnings?.total ?? 0),
      totalPaidOut: Number(totalPaidOut?.total ?? 0),
      pendingPayoutAmount: Number(pendingPayouts[0]?.total ?? 0),
      pendingPayoutCount: pendingPayouts[0]?.count ?? 0,
      tierDistribution: tierDistribution.reduce(
        (acc: Record<string, number>, row: any) => {
          acc[row.tier] = row.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      developerShareRate: DEVELOPER_SHARE_RATE,
      platformFeeRate: PLATFORM_FEE_RATE,
    });
  });

  return router;
}

function getNextTier(currentTier: string): string | null {
  const tiers = ["bronze", "silver", "gold", "platinum"];
  const idx = tiers.indexOf(currentTier);
  return idx < tiers.length - 1 ? tiers[idx + 1] : null;
}

function getEarningsToNextTier(totalEarnings: number): number | null {
  if (totalEarnings >= 10000) return null; // Already platinum
  if (totalEarnings >= 5000) return 10000 - totalEarnings;
  if (totalEarnings >= 1000) return 5000 - totalEarnings;
  return 1000 - totalEarnings;
}
