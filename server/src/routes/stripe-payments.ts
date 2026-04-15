import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  skillMartSkills,
  stripePaymentSessions,
  skillMartPurchases,
  stripeConnectAccounts,
  stripePayoutSummaries,
} from "@paperclipai/db";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { validate } from "../middleware/validate.js";
import { forbidden, notFound, badRequest } from "../errors.js";

/** Platform commission rate (15%) */
const PLATFORM_FEE_RATE = 0.15;

/**
 * Lightweight Stripe client — no SDK dependency.
 * Uses Stripe REST API via fetch for minimal footprint.
 */
function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return {
    async post(path: string, body: Record<string, string>) {
      const res = await fetch(`https://api.stripe.com/v1${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(body).toString(),
      });
      return res.json();
    },
    async get(path: string) {
      const res = await fetch(`https://api.stripe.com/v1${path}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      return res.json();
    },
  };
}

/** Compute platform fee and seller amount */
function splitPayment(amount: number) {
  const platformFee = Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
  const sellerAmount = Math.round((amount - platformFee) * 100) / 100;
  return { platformFee, sellerAmount };
}

const createCheckoutSchema = z.object({
  skillId: z.string().uuid(),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
});

const createRefundSchema = z.object({
  reason: z.string().optional(),
});

const onboardSellerSchema = z.object({
  country: z.string().default("US"),
  return_url: z.string().optional(),
});

export function stripePaymentRoutes(db: Db) {
  const router = Router();

  // ── POST /stripe/checkout — Create a Stripe Checkout Session for a paid skill
  router.post("/stripe/checkout", validate(createCheckoutSchema), async (req, res) => {
    const effectiveCompanyId =
      (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";
    const { skillId, successUrl, cancelUrl } = req.body;

    // 1. Load skill
    const [skill] = await db
      .select()
      .from(skillMartSkills)
      .where(eq(skillMartSkills.id, skillId as any))
      .limit(1);

    if (!skill) throw notFound("Skill not found");
    if (!(skill as any).isPaid) throw badRequest("Skill is free, no checkout needed");
    if ((skill as any).status !== "published") throw badRequest("Skill is not available");

    const price = Number((skill as any).price);
    const currency = ((skill as any).priceCurrency ?? "USD").toLowerCase();
    const { platformFee, sellerAmount } = splitPayment(price);

    // 2. Check if already purchased
    const [existing] = await db
      .select()
      .from(skillMartPurchases)
      .where(
        and(
          eq(skillMartPurchases.companyId, effectiveCompanyId as any),
          eq(skillMartPurchases.skillId, skillId as any),
          eq(skillMartPurchases.status, "active" as any),
        ),
      )
      .limit(1);

    if (existing) {
      return res.json({ alreadyPurchased: true, purchaseId: (existing as any).id });
    }

    // 3. Try real Stripe, or use demo mode
    const stripe = getStripeClient();
    let sessionId: string;
    let sessionUrl: string | undefined;

    if (stripe) {
      // Real Stripe checkout
      const sellerAccountId = await getSellerStripeAccountId(db, (skill as any).companyId);

      const params: Record<string, string> = {
        "payment_intent_data[metadata][skill_id]": skillId,
        "payment_intent_data[metadata][buyer_company_id]": effectiveCompanyId,
        "payment_intent_data[metadata][seller_company_id]": (skill as any).companyId,
        "line_items[0][price_data][currency]": currency,
        "line_items[0][price_data][product_data][name]": (skill as any).name,
        "line_items[0][price_data][product_data][description]":
          (skill as any).description ?? "",
        "line_items[0][price_data][unit_amount]": String(Math.round(price * 100)),
        "line_items[0][quantity]": "1",
        mode: "payment",
        "metadata[skill_id]": skillId,
        "metadata[company_id]": effectiveCompanyId,
        success_url: successUrl ?? `${process.env.APP_URL ?? "http://localhost:3101"}/skill-mart?checkout=success`,
        cancel_url: cancelUrl ?? `${process.env.APP_URL ?? "http://localhost:3101"}/skill-mart?checkout=cancel`,
      };

      if (sellerAccountId) {
        // Stripe Connect: transfer to seller
        params["payment_intent_data[transfer_data][destination]"] = sellerAccountId;
        params["payment_intent_data[transfer_data][amount]"] = String(
          Math.round(sellerAmount * 100),
        );
      }

      const session = await stripe.post("/checkout/sessions", params);
      if (session.error) {
        throw badRequest(`Stripe error: ${session.error.message}`);
      }
      sessionId = session.id;
      sessionUrl = session.url;
    } else {
      // Demo mode — simulate checkout
      sessionId = `cs_demo_${Date.now()}_${skillId.slice(0, 8)}`;
      sessionUrl = undefined;
    }

    // 4. Save session to DB
    const [inserted] = await db
      .insert(stripePaymentSessions)
      .values({
        companyId: effectiveCompanyId,
        skillId,
        stripeSessionId: sessionId,
        amount: String(price),
        currency: (skill as any).priceCurrency ?? "USD",
        platformFee: String(platformFee),
        sellerAmount: String(sellerAmount),
        status: "pending",
        metadata: { skillName: (skill as any).name },
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
      } as any)
      .returning();

    res.status(201).json({
      sessionId,
      sessionUrl,
      paymentSessionId: (inserted as any).id,
      amount: price,
      currency: (skill as any).priceCurrency ?? "USD",
      platformFee,
      sellerAmount,
    });
  });

  // ── POST /stripe/confirm-demo — Confirm a demo mode payment (no real Stripe)
  router.post("/stripe/confirm-demo", async (req, res) => {
    const effectiveCompanyId =
      (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";
    const { paymentSessionId } = req.body as { paymentSessionId?: string };

    if (!paymentSessionId) throw badRequest("paymentSessionId is required");

    // Load session
    const [session] = await db
      .select()
      .from(stripePaymentSessions)
      .where(eq(stripePaymentSessions.id, paymentSessionId as any))
      .limit(1);

    if (!session) throw notFound("Payment session not found");
    if ((session as any).status !== "pending") throw badRequest("Session is not pending");
    if (!(session as any).stripeSessionId.startsWith("cs_demo_"))
      throw badRequest("Not a demo session — use webhook for real Stripe");

    // Update session
    await db
      .update(stripePaymentSessions)
      .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() } as any)
      .where(eq(stripePaymentSessions.id, paymentSessionId as any));

    // Create purchase record
    const [purchase] = await db
      .insert(skillMartPurchases)
      .values({
        companyId: effectiveCompanyId,
        skillId: (session as any).skillId,
        sessionId: paymentSessionId,
        amount: (session as any).amount,
        currency: (session as any).currency,
        platformFee: (session as any).platformFee,
        status: "active",
      } as any)
      .returning();

    res.json({
      success: true,
      purchaseId: (purchase as any).id,
      skillId: (session as any).skillId,
    });
  });

  // ── POST /stripe/webhook — Stripe webhook handler
  router.post("/stripe/webhook", async (req, res) => {
    // In production, verify Stripe signature:
    // const sig = req.headers["stripe-signature"];
    // stripe.webhooks.constructEvent(req.body, sig, endpointSecret)

    const event = req.body;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const stripeSessionId = session.id;

      // Find our session record
      const [dbSession] = await db
        .select()
        .from(stripePaymentSessions)
        .where(eq(stripePaymentSessions.stripeSessionId, stripeSessionId as any))
        .limit(1);

      if (!dbSession) {
        console.warn(`Webhook: session not found for ${stripeSessionId}`);
        return res.json({ received: true });
      }

      // Update session to paid
      await db
        .update(stripePaymentSessions)
        .set({
          status: "paid",
          stripePaymentIntentId: session.payment_intent ?? null,
          paidAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(eq(stripePaymentSessions.id, (dbSession as any).id));

      // Create purchase record
      await db.insert(skillMartPurchases).values({
        companyId: (dbSession as any).companyId,
        skillId: (dbSession as any).skillId,
        sessionId: (dbSession as any).id,
        amount: (dbSession as any).amount,
        currency: (dbSession as any).currency,
        platformFee: (dbSession as any).platformFee,
        status: "active",
      } as any);
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent;

      // Mark purchase as refunded
      const [session] = await db
        .select()
        .from(stripePaymentSessions)
        .where(eq(stripePaymentSessions.stripePaymentIntentId, paymentIntentId as any))
        .limit(1);

      if (session) {
        await db
          .update(stripePaymentSessions)
          .set({ status: "refunded", updatedAt: new Date() } as any)
          .where(eq(stripePaymentSessions.id, (session as any).id));

        await db
          .update(skillMartPurchases)
          .set({ status: "refunded", refundedAt: new Date() } as any)
          .where(
            and(
              eq(skillMartPurchases.sessionId, (session as any).id),
              eq(skillMartPurchases.status, "active" as any),
            ),
          );
      }
    }

    res.json({ received: true });
  });

  // ── GET /stripe/purchases — List purchases for current company
  router.get("/stripe/purchases", async (req, res) => {
    const effectiveCompanyId =
      (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";

    const purchases = await db
      .select({
        id: skillMartPurchases.id,
        skillId: skillMartPurchases.skillId,
        amount: skillMartPurchases.amount,
        currency: skillMartPurchases.currency,
        platformFee: skillMartPurchases.platformFee,
        status: skillMartPurchases.status,
        purchasedAt: skillMartPurchases.purchasedAt,
        skillName: skillMartSkills.name,
        skillSlug: skillMartSkills.slug,
      })
      .from(skillMartPurchases)
      .leftJoin(skillMartSkills, eq(skillMartPurchases.skillId, skillMartSkills.id as any))
      .where(eq(skillMartPurchases.companyId, effectiveCompanyId as any))
      .orderBy(desc(skillMartPurchases.purchasedAt));

    res.json(purchases);
  });

  // ── GET /stripe/sales — List sales for current company (as seller)
  router.get("/stripe/sales", async (req, res) => {
    const effectiveCompanyId =
      (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";

    // Get all paid sessions where this company is the skill owner
    const sales = await db
      .select({
        id: stripePaymentSessions.id,
        skillId: stripePaymentSessions.skillId,
        amount: stripePaymentSessions.amount,
        currency: stripePaymentSessions.currency,
        platformFee: stripePaymentSessions.platformFee,
        sellerAmount: stripePaymentSessions.sellerAmount,
        status: stripePaymentSessions.status,
        paidAt: stripePaymentSessions.paidAt,
        skillName: skillMartSkills.name,
      })
      .from(stripePaymentSessions)
      .leftJoin(skillMartSkills, eq(stripePaymentSessions.skillId, skillMartSkills.id as any))
      .where(
        and(
          eq(skillMartSkills.companyId, effectiveCompanyId as any),
          eq(stripePaymentSessions.status, "paid" as any),
        ),
      )
      .orderBy(desc(stripePaymentSessions.paidAt));

    res.json(sales);
  });

  // ── GET /stripe/sales/summary — Sales summary for payout dashboard
  router.get("/stripe/sales/summary", async (req, res) => {
    const effectiveCompanyId =
      (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";

    // Current period
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Check existing summary
    const [existing] = await db
      .select()
      .from(stripePayoutSummaries)
      .where(
        and(
          eq(stripePayoutSummaries.companyId, effectiveCompanyId as any),
          eq(stripePayoutSummaries.period, period),
        ),
      )
      .limit(1);

    if (existing) {
      return res.json(existing);
    }

    // Compute from sessions
    const result = await db
      .select({
        totalRevenue: sql<string>`COALESCE(SUM(CAST(${stripePaymentSessions.sellerAmount} AS NUMERIC)), 0)`,
        platformFees: sql<string>`COALESCE(SUM(CAST(${stripePaymentSessions.platformFee} AS NUMERIC)), 0)`,
        salesCount: sql<number>`COUNT(*)::int`,
      })
      .from(stripePaymentSessions)
      .leftJoin(skillMartSkills, eq(stripePaymentSessions.skillId, skillMartSkills.id as any))
      .where(
        and(
          eq(skillMartSkills.companyId, effectiveCompanyId as any),
          eq(stripePaymentSessions.status, "paid" as any),
        ),
      );

    const totalRevenue = Number(result[0]?.totalRevenue ?? 0);
    const platformFees = Number(result[0]?.platformFees ?? 0);
    const salesCount = result[0]?.salesCount ?? 0;
    const netPayout = totalRevenue;

    // Create summary
    const [summary] = await db
      .insert(stripePayoutSummaries)
      .values({
        companyId: effectiveCompanyId,
        period,
        totalRevenue: String(totalRevenue),
        platformFees: String(platformFees),
        netPayout: String(netPayout),
        salesCount,
        payoutStatus: "pending",
      } as any)
      .returning();

    res.json(summary);
  });

  // ── POST /stripe/seller/onboard — Onboard a seller with Stripe Connect
  router.post("/stripe/seller/onboard", validate(onboardSellerSchema), async (req, res) => {
    const effectiveCompanyId =
      (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";
    const { country } = req.body;

    // Check if already onboarded
    const [existing] = await db
      .select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.companyId, effectiveCompanyId as any))
      .limit(1);

    if (existing && (existing as any).status === "active") {
      return res.json({ accountId: (existing as any).stripeAccountId, status: "active" });
    }

    const stripe = getStripeClient();

    if (stripe) {
      // Create Stripe Connect account
      const account = await stripe.post("/accounts", {
        type: "express",
        country: country ?? "US",
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
      });

      if (account.error) {
        throw badRequest(`Stripe Connect error: ${account.error.message}`);
      }

      // Save or update
      if (existing) {
        await db
          .update(stripeConnectAccounts)
          .set({
            stripeAccountId: account.id,
            status: "pending",
            country: country ?? "US",
            updatedAt: new Date(),
          } as any)
          .where(eq(stripeConnectAccounts.id, (existing as any).id));
      } else {
        await db.insert(stripeConnectAccounts).values({
          companyId: effectiveCompanyId,
          stripeAccountId: account.id,
          status: "pending",
          country: country ?? "US",
        } as any);
      }

      // Create account link for onboarding
      const returnUrl =
        req.body.return_url ??
        `${process.env.APP_URL ?? "http://localhost:3101"}/skill-mart?seller=onboarded`;
      const accountLink = await stripe.post("/account_links", {
        account: account.id,
        refresh_url: returnUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      res.json({
        accountId: account.id,
        onboardingUrl: accountLink.url,
        status: "pending",
      });
    } else {
      // Demo mode
      const demoAccountId = `acct_demo_${effectiveCompanyId.slice(0, 8)}`;

      if (existing) {
        await db
          .update(stripeConnectAccounts)
          .set({
            stripeAccountId: demoAccountId,
            status: "active",
            payoutsEnabled: true,
            updatedAt: new Date(),
          } as any)
          .where(eq(stripeConnectAccounts.id, (existing as any).id));
      } else {
        await db.insert(stripeConnectAccounts).values({
          companyId: effectiveCompanyId,
          stripeAccountId: demoAccountId,
          status: "active",
          country: country ?? "US",
          payoutsEnabled: true,
        } as any);
      }

      res.json({
        accountId: demoAccountId,
        status: "active",
        demo: true,
      });
    }
  });

  // ── GET /stripe/seller/status — Get seller account status
  router.get("/stripe/seller/status", async (req, res) => {
    const effectiveCompanyId =
      (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";

    const [account] = await db
      .select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.companyId, effectiveCompanyId as any))
      .limit(1);

    if (!account) {
      return res.json({ onboarded: false });
    }

    res.json({
      onboarded: (account as any).status === "active",
      status: (account as any).status,
      payoutsEnabled: (account as any).payoutsEnabled,
      country: (account as any).country,
    });
  });

  // ── GET /stripe/purchases/check/:skillId — Check if company purchased a skill
  router.get("/stripe/purchases/check/:skillId", async (req, res) => {
    const effectiveCompanyId =
      (req as any).actor?.companyIds?.[0] ?? "00000000-0000-0000-0000-000000000001";
    const { skillId } = req.params;

    const [purchase] = await db
      .select()
      .from(skillMartPurchases)
      .where(
        and(
          eq(skillMartPurchases.companyId, effectiveCompanyId as any),
          eq(skillMartPurchases.skillId, skillId as any),
          eq(skillMartPurchases.status, "active" as any),
        ),
      )
      .limit(1);

    res.json({ purchased: !!purchase, purchaseId: purchase ? (purchase as any).id : null });
  });

  return router;
}

/** Helper: get seller's Stripe Connect account ID */
async function getSellerStripeAccountId(db: Db, companyId: string): Promise<string | null> {
  const [account] = await db
    .select()
    .from(stripeConnectAccounts)
    .where(
      and(
        eq(stripeConnectAccounts.companyId, companyId as any),
        eq(stripeConnectAccounts.status, "active" as any),
      ),
    )
    .limit(1);
  return account ? (account as any).stripeAccountId : null;
}
