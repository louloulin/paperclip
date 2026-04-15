import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { skillMartSkills } from "./skill-mart.js";

/**
 * Stripe Payment Sessions - tracks checkout sessions for paid skills
 */
export const stripePaymentSessions = pgTable(
  "stripe_payment_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    skillId: uuid("skill_id").notNull().references(() => skillMartSkills.id),
    stripeSessionId: text("stripe_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    platformFee: numeric("platform_fee", { precision: 10, scale: 2 }).notNull().default("0"),
    sellerAmount: numeric("seller_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    status: text("status").notNull().default("pending"), // pending | paid | refunded | expired
    metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("stripe_sessions_company_idx").on(table.companyId),
    skillIdx: index("stripe_sessions_skill_idx").on(table.skillId),
    stripeSessionIdx: index("stripe_sessions_stripe_idx").on(table.stripeSessionId),
    statusIdx: index("stripe_sessions_status_idx").on(table.status),
  }),
);

/**
 * Skill Mart Purchases - confirmed purchase records (after payment)
 */
export const skillMartPurchases = pgTable(
  "skill_mart_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    skillId: uuid("skill_id").notNull().references(() => skillMartSkills.id),
    sessionId: uuid("session_id").references(() => stripePaymentSessions.id),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    platformFee: numeric("platform_fee", { precision: 10, scale: 2 }).notNull().default("0"),
    status: text("status").notNull().default("active"), // active | refunded
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  },
  (table) => ({
    companyIdx: index("skill_purchases_company_idx").on(table.companyId),
    skillIdx: index("skill_purchases_skill_idx").on(table.skillId),
    companySkillIdx: index("skill_purchases_company_skill_idx").on(table.companyId, table.skillId),
  }),
);

/**
 * Stripe Connect Accounts - seller accounts for payout
 */
export const stripeConnectAccounts = pgTable(
  "stripe_connect_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    stripeAccountId: text("stripe_account_id").notNull(),
    status: text("status").notNull().default("pending"), // pending | active | restricted
    country: text("country").default("US"),
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("stripe_connect_company_idx").on(table.companyId),
    stripeIdx: index("stripe_connect_account_idx").on(table.stripeAccountId),
  }),
);

/**
 * Payout Summaries - tracks monthly payout summaries per seller
 */
export const stripePayoutSummaries = pgTable(
  "stripe_payout_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    period: text("period").notNull(), // "2026-04" format
    totalRevenue: numeric("total_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
    platformFees: numeric("platform_fees", { precision: 12, scale: 2 }).notNull().default("0"),
    netPayout: numeric("net_payout", { precision: 12, scale: 2 }).notNull().default("0"),
    salesCount: integer("sales_count").notNull().default(0),
    payoutStatus: text("payout_status").notNull().default("pending"), // pending | paid
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyPeriodIdx: index("stripe_payout_company_period_idx").on(table.companyId, table.period),
  }),
);
