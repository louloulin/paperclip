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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * SkillMart Skills - published skills in the marketplace
 */
export const skillMartSkills = pgTable(
  "skill_mart_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    skillKey: text("skill_key").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    markdown: text("markdown").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    version: text("version").notNull().default("1.0.0"),
    sourceType: text("source_type").notNull().default("local_path"),
    sourceLocator: text("source_locator"),
    downloadCount: integer("download_count").notNull().default(0),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }).notNull().default("0"),
    ratingCount: integer("rating_count").notNull().default(0),
    isPaid: boolean("is_paid").notNull().default(false),
    price: numeric("price", { precision: 10, scale: 2 }).default("0"),
    priceCurrency: text("price_currency").notNull().default("USD"),
    status: text("status").notNull().default("draft"),
    reviewStatus: text("review_status").notNull().default("approved"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("skill_mart_skills_company_idx").on(table.companyId),
    statusIdx: index("skill_mart_skills_status_idx").on(table.status),
    companySkillKeyIdx: uniqueIndex("skill_mart_skills_company_skill_key_idx").on(
      table.companyId,
      table.skillKey,
    ),
  }),
);

/**
 * SkillMart Reviews - ratings and reviews
 */
export const skillMartReviews = pgTable(
  "skill_mart_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id").notNull().references(() => skillMartSkills.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    status: text("status").notNull().default("approved"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    skillIdx: index("skill_mart_reviews_skill_idx").on(table.skillId),
    companyIdx: index("skill_mart_reviews_company_idx").on(table.companyId),
  }),
);

/**
 * SkillMart Downloads - download records
 */
export const skillMartDownloads = pgTable(
  "skill_mart_downloads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id").notNull().references(() => skillMartSkills.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    version: text("version").notNull(),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    skillIdx: index("skill_mart_downloads_skill_idx").on(table.skillId),
    companyIdx: index("skill_mart_downloads_company_idx").on(table.companyId),
  }),
);
