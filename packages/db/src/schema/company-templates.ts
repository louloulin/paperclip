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
 * Company Templates - pre-built vertical industry templates
 */
export const companyTemplates = pgTable(
  "company_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publisherId: uuid("publisher_id").notNull().references(() => companies.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("general"),
    industry: text("industry").notNull().default("technology"),
    icon: text("icon"),
    version: text("version").notNull().default("1.0.0"),
    // Template configuration JSON: agents, skills, org structure, etc.
    config: jsonb("config").$type<CompanyTemplateConfig>().notNull().default({}),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    isPaid: boolean("is_paid").notNull().default(false),
    price: numeric("price", { precision: 10, scale: 2 }).default("0"),
    priceCurrency: text("price_currency").notNull().default("USD"),
    downloadCount: integer("download_count").notNull().default(0),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }).notNull().default("0"),
    ratingCount: integer("rating_count").notNull().default(0),
    status: text("status").notNull().default("draft"),
    isOfficial: boolean("is_official").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    publisherIdx: index("company_templates_publisher_idx").on(table.publisherId),
    categoryIdx: index("company_templates_category_idx").on(table.category),
    industryIdx: index("company_templates_industry_idx").on(table.industry),
    statusIdx: index("company_templates_status_idx").on(table.status),
    slugIdx: index("company_templates_slug_idx").on(table.slug),
  }),
);

/**
 * Template Reviews - ratings and reviews for templates
 */
export const companyTemplateReviews = pgTable(
  "company_template_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: text("template_id").notNull(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    status: text("status").notNull().default("approved"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    templateIdx: index("template_reviews_template_idx").on(table.templateId),
    companyIdx: index("template_reviews_company_idx").on(table.companyId),
  }),
);

/**
 * Template Installs - tracks which companies installed which templates
 */
export const companyTemplateInstalls = pgTable(
  "company_template_installs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: text("template_id").notNull(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    version: text("version").notNull(),
    configOverrides: jsonb("config_overrides").$type<Record<string, unknown>>().default({}),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    templateIdx: index("template_installs_template_idx").on(table.templateId),
    companyIdx: index("template_installs_company_idx").on(table.companyId),
    companyTemplateIdx: index("template_installs_company_template_idx").on(table.companyId, table.templateId),
  }),
);

/**
 * Template config type definition
 */
export interface CompanyTemplateConfig {
  agents?: Array<{
    name: string;
    role: string;
    skills?: string[];
    reportsTo?: string;
  }>;
  departments?: Array<{
    name: string;
    description?: string;
    members?: string[];
  }>;
  skills?: Array<{
    key: string;
    name: string;
    source?: string;
  }>;
  settings?: Record<string, unknown>;
}
