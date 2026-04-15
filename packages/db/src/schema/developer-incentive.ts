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

/**
 * Developer Profiles — tracks developer tier and stats
 */
export const developerProfiles = pgTable(
  "developer_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    tier: text("tier").notNull().default("bronze"), // bronze | silver | gold | platinum
    totalEarnings: numeric("total_earnings", { precision: 12, scale: 2 }).notNull().default("0"),
    totalSales: integer("total_sales").notNull().default(0),
    totalSkills: integer("total_skills").notNull().default(0),
    referralCode: text("referral_code").unique(),
    referredBy: uuid("referred_by"),
    referralEarnings: numeric("referral_earnings", { precision: 12, scale: 2 }).notNull().default("0"),
    payoutMethod: text("payout_method").default("stripe"), // stripe | bank | paypal
    payoutDetails: jsonb("payout_details").$type<Record<string, string>>().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("dev_profiles_company_idx").on(table.companyId),
    tierIdx: index("dev_profiles_tier_idx").on(table.tier),
    referralIdx: index("dev_profiles_referral_idx").on(table.referralCode),
  }),
);

/**
 * Developer Earnings — monthly earnings records
 */
export const developerEarnings = pgTable(
  "developer_earnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    period: text("period").notNull(), // "2026-04" format
    salesRevenue: numeric("sales_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
    platformFees: numeric("platform_fees", { precision: 12, scale: 2 }).notNull().default("0"),
    netEarnings: numeric("net_earnings", { precision: 12, scale: 2 }).notNull().default("0"),
    referralBonus: numeric("referral_bonus", { precision: 12, scale: 2 }).notNull().default("0"),
    tierBonus: numeric("tier_bonus", { precision: 12, scale: 2 }).notNull().default("0"),
    totalPayout: numeric("total_payout", { precision: 12, scale: 2 }).notNull().default("0"),
    salesCount: integer("sales_count").notNull().default(0),
    newCustomers: integer("new_customers").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyPeriodIdx: index("dev_earnings_company_period_idx").on(table.companyId, table.period),
  }),
);

/**
 * Payout Requests — developer payout requests
 */
export const payoutRequests = pgTable(
  "payout_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    method: text("method").notNull().default("stripe"), // stripe | bank | paypal
    status: text("status").notNull().default("pending"), // pending | processing | completed | failed | cancelled
    payoutMethodDetails: jsonb("payout_method_details").$type<Record<string, string>>().default({}),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("payout_requests_company_idx").on(table.companyId),
    statusIdx: index("payout_requests_status_idx").on(table.status),
    createdIdx: index("payout_requests_created_idx").on(table.createdAt),
  }),
);
