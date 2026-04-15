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

export const adapterMarketplace = pgTable(
  "adapter_marketplace",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    adapterType: text("adapter_type").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    markdown: text("markdown").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    version: text("version").notNull().default("1.0.0"),
    sourceType: text("source_type").notNull().default("npm"),
    sourceLocator: text("source_locator"),
    authorName: text("author_name"),
    authorUrl: text("author_url"),
    homepageUrl: text("homepage_url"),
    repositoryUrl: text("repository_url"),
    configSchema: jsonb("config_schema"),
    compatibleAdapters: jsonb("compatible_adapters").$type<string[]>().notNull().default([]),
    installCount: integer("install_count").notNull().default(0),
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
    companyIdx: index("adapter_marketplace_company_idx").on(table.companyId),
    statusIdx: index("adapter_marketplace_status_idx").on(table.status),
    companyTypeIdx: uniqueIndex("adapter_marketplace_company_type_idx").on(
      table.companyId,
      table.adapterType,
    ),
  }),
);

export const adapterMarketplaceReviews = pgTable(
  "adapter_marketplace_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adapterId: uuid("adapter_id").notNull().references(() => adapterMarketplace.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    status: text("status").notNull().default("approved"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    adapterIdx: index("adapter_marketplace_reviews_adapter_idx").on(table.adapterId),
    companyIdx: index("adapter_marketplace_reviews_company_idx").on(table.companyId),
  }),
);

export const adapterMarketplaceInstalls = pgTable(
  "adapter_marketplace_installs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adapterId: uuid("adapter_id").notNull().references(() => adapterMarketplace.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    version: text("version").notNull(),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    adapterIdx: index("adapter_marketplace_installs_adapter_idx").on(table.adapterId),
    companyIdx: index("adapter_marketplace_installs_company_idx").on(table.companyId),
  }),
);
